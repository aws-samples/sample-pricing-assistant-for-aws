import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { v4 as uuidv4 } from 'uuid';
import { parseInfrastructureFile } from '../services/parserService.js';
import { generateCostEstimationPrompt } from '../services/costEstimationService.js';
import { S3Service } from '../services/s3Service.js';

// Initialize S3 service
const s3Service = new S3Service();

// Supported file types for infrastructure files
const SUPPORTED_EXTENSIONS = [
  '.json',     // CloudFormation, CDK
  '.yaml',     // CloudFormation, CDK
  '.yml',      // CloudFormation, CDK
  '.tf',       // Terraform
  '.tfvars',   // Terraform variables
  '.ts',       // CDK TypeScript
  '.js',       // CDK JavaScript
  '.py',       // CDK Python, Pulumi Python
  '.go',       // Pulumi Go
  '.cs',       // Pulumi C#
];

const SUPPORTED_MIME_TYPES = [
  'application/json',
  'text/yaml',
  'application/x-yaml',
  'text/plain',
  'text/x-yaml',
  'application/octet-stream', // For YAML files detected as binary
  'application/x-typescript',
  'application/typescript',
  'text/typescript',
  'text/x-typescript',
  'application/javascript',
  'text/javascript',
  'text/x-python',
  'application/x-python-code',
  'text/x-go',
  'text/x-csharp',
];

// File validation schema
const FileUploadSchema = z.object({
  originalname: z.string().min(1).max(255),
  mimetype: z.string().refine(
    (mime) => SUPPORTED_MIME_TYPES.includes(mime),
    { message: 'Unsupported file type' }
  ),
  size: z.number().max(10 * 1024 * 1024), // 10MB max
  buffer: z.instanceof(Buffer),
});

// Upload response schema
const UploadResponseSchema = z.object({
  success: z.boolean(),
  fileId: z.string().uuid(),
  filename: z.string(),
  size: z.number(),
  type: z.enum(['cloudformation', 'terraform', 'cdk', 'pulumi', 'unknown']),
  message: z.string(),
  uploadedAt: z.string(),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;

// Configure multer for memory storage (we'll validate before saving)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10, // Support up to 10 files at once
  },
  fileFilter: (_req, file, cb) => {
    // Basic file extension check
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`Unsupported file extension: ${ext}`));
    }
    
    // Basic MIME type check
    if (!SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`Unsupported MIME type: ${file.mimetype}`));
    }
    
    // Additional validation for octet-stream - ensure it's a known infrastructure file extension
    if (file.mimetype === 'application/octet-stream') {
      const allowedForOctetStream = ['.yaml', '.yml', '.json', '.tf', '.tfvars', '.ts', '.js', '.py', '.go', '.cs'];
      if (!allowedForOctetStream.includes(ext)) {
        return cb(new Error(`File extension ${ext} not allowed for binary files`));
      }
    }
    
    cb(null, true);
  },
});

// Determine file type based on content and filename
function determineFileType(filename: string, content: string): string {
  const ext = path.extname(filename).toLowerCase();
  const lowerContent = content.toLowerCase();
  
  // CloudFormation detection
  if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
    if (lowerContent.includes('awstemplateformatversion') || 
        lowerContent.includes('resources:') ||
        lowerContent.includes('"resources"')) {
      return 'cloudformation';
    }
  }
  
  // CDK detection
  if (ext === '.ts' || ext === '.js' || ext === '.py') {
    if (lowerContent.includes('@aws-cdk') || 
        lowerContent.includes('aws-cdk-lib') ||
        lowerContent.includes('from aws_cdk')) {
      return 'cdk';
    }
  }
  
  // Terraform detection
  if (ext === '.tf' || ext === '.tfvars') {
    return 'terraform';
  }
  
  if (lowerContent.includes('terraform {') || 
      lowerContent.includes('provider "aws"') ||
      lowerContent.includes('resource "aws_')) {
    return 'terraform';
  }
  
  // Pulumi detection
  if (lowerContent.includes('pulumi') || 
      lowerContent.includes('@pulumi/') ||
      lowerContent.includes('import pulumi')) {
    return 'pulumi';
  }
  
  return 'unknown';
}

// Security validation for file content
// NOTE: This is a basic heuristic scanner for demo/sample code purposes.
// Production use requires a proper WAF, sandbox, or dedicated scanning service.
async function validateFileContent(content: string, filename: string): Promise<{ isValid: boolean; reason?: string }> {
  // Check for potentially malicious content (but exclude common infrastructure patterns)
  const suspiciousPatterns = [
    /eval\s*\(/i,
    /exec\s*\(/i,
    /system\s*\(/i,
    /shell_exec\s*\(/i,
    /<script[^>]*>/i,
    /javascript:/i,
    /vbscript:/i,
    // Unicode escape evasion (e.g., \u0065val)
    /\\u0065\\u0076\\u0061\\u006c/i,
    /\\u0065val/i,
    // Function constructor evasion
    /Function\s*\(/i,
    /\['constructor'\]/i,
    // Only flag onclick/onload if not in YAML context
    /on(click|load|error|focus|blur)\s*=/i,
  ];
  
  // Skip onclick/onload pattern for YAML files (common in CloudFormation)
  const isYaml = filename.toLowerCase().endsWith('.yaml') || filename.toLowerCase().endsWith('.yml');
  const patternsToCheck = isYaml ? suspiciousPatterns.slice(0, -1) : suspiciousPatterns;
  
  for (const pattern of patternsToCheck) {
    if (pattern.test(content)) {
      return { 
        isValid: false, 
        reason: 'File contains potentially malicious content' 
      };
    }
  }
  
  // Check file size after decompression (prevent zip bombs)
  if (content.length > 50 * 1024 * 1024) { // 50MB uncompressed
    return { 
      isValid: false, 
      reason: 'File content too large after processing' 
    };
  }
  
  // Basic structure validation for known file types
  const fileType = determineFileType(filename, content);
  
  if (fileType === 'cloudformation') {
    try {
      if (filename.endsWith('.json')) {
        JSON.parse(content);
      }
      // For YAML, we'd need a YAML parser, but basic structure check is sufficient for now
    } catch (error) {
      return { 
        isValid: false, 
        reason: 'Invalid JSON structure in CloudFormation template' 
      };
    }
  }
  
  return { isValid: true };
}

// Create uploads directory if it doesn't exist
async function ensureUploadsDirectory(): Promise<string> {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
    logger.info('Created uploads directory');
  }
  return uploadsDir;
}

// Strict UUID v4 shape for file IDs. Must match exactly what uuidv4() emits
// at upload time so a request like GET /api/files/../../etc/passwd can never
// reach the filesystem layer.
const FILE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidFileId(fileId: unknown): fileId is string {
  return typeof fileId === 'string' && FILE_ID_REGEX.test(fileId);
}

// Build a metadata path that is guaranteed to live inside uploadsDir.
// Throws if the resulting path escapes the directory — defends against any
// future change to the regex / fileId source that might let traversal slip
// through.
async function getValidatedMetadataPath(fileId: string): Promise<string> {
  const uploadsDir = await ensureUploadsDirectory();
  const candidate = path.resolve(uploadsDir, `${fileId}.meta.json`);
  const normalizedDir = path.resolve(uploadsDir);
  if (!candidate.startsWith(normalizedDir + path.sep) && candidate !== normalizedDir) {
    throw new Error('metadata path escapes uploads directory');
  }
  return candidate;
}

// Validate that a path read from a metadata file stays inside uploadsDir.
// metadata.filePath is JSON we wrote ourselves at upload time, but defense
// in depth: if the metadata file is ever corrupted or replaced, the
// fs.unlink / fs.readFile calls won't touch anything outside uploadsDir.
async function assertPathInsideUploads(candidate: string): Promise<void> {
  const uploadsDir = path.resolve(await ensureUploadsDirectory());
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(uploadsDir + path.sep) && resolved !== uploadsDir) {
    throw new Error(`path ${resolved} is outside uploads directory ${uploadsDir}`);
  }
}

// Upload file endpoint
export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    // Use multer middleware for multiple files
    upload.array('file', 10)(req, res, async (err) => {
      if (err) {
        logger.error('File upload error:', err);
        
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({
              success: false,
              error: 'File too large. Maximum size is 10MB.',
              code: 'FILE_TOO_LARGE'
            });
            return;
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            res.status(400).json({
              success: false,
              error: 'Too many files. Maximum 10 files at once.',
              code: 'TOO_MANY_FILES'
            });
            return;
          }
        }
        
        res.status(400).json({
          success: false,
          error: err.message || 'File upload failed',
          code: 'UPLOAD_ERROR'
        });
        return;
      }
      
      // Multer with upload.array('file', 10) produces req.files as a
      // File[]. Validate the runtime shape — the type system can't prevent
      // a future code change (e.g. switching to upload.fields()) from
      // making req.files an object map, and we don't want array-only
      // operations like .length below to silently misbehave.
      const rawFiles: unknown = req.files;
      if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No files provided',
          code: 'NO_FILE'
        });
        return;
      }
      const files: Express.Multer.File[] = rawFiles as Express.Multer.File[];
      
      try {
        const results: UploadResponse[] = [];
        
        // Process each file
        for (const file of files) {
          // Validate file using Zod schema
          const validatedFile = FileUploadSchema.parse(file);
          
          // Convert buffer to string for content analysis
          const content = validatedFile.buffer.toString('utf-8');
          
          // Security validation
          const contentValidation = await validateFileContent(content, validatedFile.originalname);
          if (!contentValidation.isValid) {
            res.status(400).json({
              success: false,
              error: `${validatedFile.originalname}: ${contentValidation.reason || 'File content validation failed'}`,
              code: 'INVALID_CONTENT'
            });
            return;
          }
          
          // Determine file type
          const fileType = determineFileType(validatedFile.originalname, content);
          
          // Generate unique file ID
          const fileId = uuidv4();
          const fileExtension = path.extname(validatedFile.originalname);
          
          // Create metadata
          const metadata = {
            fileId,
            originalName: validatedFile.originalname,
            size: validatedFile.size,
            type: fileType,
            mimetype: validatedFile.mimetype,
            uploadedAt: new Date().toISOString(),
            fileExtension,
          };
          
          if (config.s3.useS3) {
            // Save to S3
            await s3Service.uploadFile(fileId, `original${fileExtension}`, validatedFile.buffer, validatedFile.mimetype);
            await s3Service.uploadMetadata(fileId, metadata);
          } else {
            // Save to local storage (fallback)
            const uploadsDir = await ensureUploadsDirectory();
            const savedFilename = `${fileId}${fileExtension}`;
            const filePath = path.join(uploadsDir, savedFilename);
            
            await fs.writeFile(filePath, validatedFile.buffer);
            
            const metadataPath = path.join(uploadsDir, `${fileId}.meta.json`);
            await fs.writeFile(metadataPath, JSON.stringify({ ...metadata, filePath }, null, 2));
          }
          
          // Add to results
          const response: UploadResponse = {
            success: true,
            fileId,
            filename: validatedFile.originalname,
            size: validatedFile.size,
            type: fileType as any,
            message: `File uploaded successfully. Detected as ${fileType} infrastructure file.`,
            uploadedAt: metadata.uploadedAt,
          };
          
          results.push(response);
        }
        
        logger.info(`${files.length} files uploaded successfully`);
        
        // Return array of results for multiple files, or single result for backward compatibility
        if (files.length === 1) {
          res.status(200).json(results[0]);
        } else {
          res.status(200).json(results);
        }
        
      } catch (validationError) {
        logger.error('File validation error:', validationError);
        res.status(400).json({
          success: false,
          error: 'File validation failed',
          code: 'VALIDATION_ERROR',
          details: validationError instanceof Error ? validationError.message : 'Unknown validation error'
        });
      }
    });
    
  } catch (error) {
    logger.error('Upload endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during file upload',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Get file metadata endpoint
export const getFileMetadata = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!isValidFileId(fileId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid file ID format',
        code: 'INVALID_FILE_ID'
      });
      return;
    }

    const metadataPath = await getValidatedMetadataPath(fileId);

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      res.status(200).json({
        success: true,
        metadata
      });
      
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }
    
  } catch (error) {
    logger.error('Get file metadata error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Parse uploaded infrastructure file
 */
export const parseFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!isValidFileId(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const metadataPath = await getValidatedMetadataPath(fileId);

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      // Defense in depth: the file path stored in metadata is something we
      // wrote at upload time, but verify it still lives inside uploads/ before
      // reading it.
      await assertPathInsideUploads(metadata.filePath);

      const fileContent = await fs.readFile(metadata.filePath, 'utf-8');
      const parseResult = parseInfrastructureFile(metadata.originalName, fileContent);
      
      logger.info('File parsed successfully', {
        fileId,
        fileType: parseResult.fileType,
        resourceCount: parseResult.resources.length,
        errorCount: parseResult.errors.length
      });

      res.json({
        fileId,
        fileName: metadata.originalName,
        fileType: parseResult.fileType,
        resources: parseResult.resources,
        errors: parseResult.errors,
        parsedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('File not found or invalid', { fileId, error });
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    logger.error('Parse file error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get cost estimation for uploaded infrastructure file
 */
export const estimateFileCost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!isValidFileId(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const metadataPath = await getValidatedMetadataPath(fileId);

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      // Defense in depth: the file path stored in metadata is something we
      // wrote at upload time, but verify it still lives inside uploads/ before
      // reading it.
      await assertPathInsideUploads(metadata.filePath);

      const fileContent = await fs.readFile(metadata.filePath, 'utf-8');
      const parseResult = parseInfrastructureFile(metadata.originalName, fileContent);
      
      if (parseResult.errors.length > 0) {
        res.status(400).json({ 
          error: 'Cannot estimate cost for file with parsing errors',
          parseErrors: parseResult.errors 
        });
        return;
      }

      if (parseResult.resources.length === 0) {
        res.status(400).json({ 
          error: 'No AWS resources found in file' 
        });
        return;
      }

      // Generate cost estimation prompt for Bedrock Agent
      const costPrompt = generateCostEstimationPrompt(parseResult.resources, metadata.originalName);
      
      logger.info('Generated cost estimation prompt for file', {
        fileId,
        fileName: metadata.originalName,
        resourceCount: parseResult.resources.length
      });

      res.json({
        fileId,
        fileName: metadata.originalName,
        fileType: parseResult.fileType,
        resourceCount: parseResult.resources.length,
        costEstimationPrompt: costPrompt,
        message: 'Use this prompt with the chat interface to get cost estimates',
        estimatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('File not found or invalid', { fileId, error });
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    logger.error('Cost estimation error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete file endpoint
export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!isValidFileId(fileId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid file ID format',
        code: 'INVALID_FILE_ID'
      });
      return;
    }

    const metadataPath = await getValidatedMetadataPath(fileId);

    try {
      // Read metadata to get file path
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      // Defense in depth: the file path stored in metadata is something we
      // wrote at upload time, but verify it still lives inside uploads/ before
      // unlinking. metadataPath is already validated above.
      await assertPathInsideUploads(metadata.filePath);

      // Delete both the file and metadata
      await fs.unlink(metadata.filePath);
      await fs.unlink(metadataPath);
      
      logger.info(`File deleted successfully: ${fileId}`);
      
      res.status(200).json({
        success: true,
        message: 'File deleted successfully'
      });
      
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }
    
  } catch (error) {
    logger.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

export const getFileDownloadUrl = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    if (!config.s3.useS3) {
      return res.status(400).json({ error: 'Export functionality requires S3 storage' });
    }

    const metadata = await s3Service.getMetadata(fileId);
    const downloadUrl = await s3Service.getDownloadUrl(
      fileId, 
      `original${path.extname(metadata.originalName)}`,
      3600 // 1 hour expiry
    );
    
    logger.info('Generated download URL for file', { fileId, originalName: metadata.originalName });
    
    return res.json({ 
      downloadUrl, 
      fileName: metadata.originalName,
      expiresIn: 3600
    });

  } catch (error) {
    logger.error('Failed to generate download URL', {
      fileId: req.params.fileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return res.status(404).json({ error: 'File not found' });
  }
};
