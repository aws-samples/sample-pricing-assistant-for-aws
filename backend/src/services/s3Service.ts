import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '@/utils/logger.js';
import { config } from '@/utils/config.js';

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const clientConfig: S3ClientConfig = {
      region: config.s3.region,
    };
    
    this.s3Client = new S3Client(clientConfig);
    this.bucketName = config.s3.bucketName;
  }

  /**
   * Upload file to S3
   */
  async uploadFile(fileId: string, fileName: string, content: Buffer, contentType: string): Promise<string> {
    const key = `files/${fileId}/${fileName}`;
    
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: {
          uploadedAt: new Date().toISOString(),
          fileId,
          originalName: fileName
        }
      }));

      logger.info('File uploaded to S3', { fileId, key, bucketName: this.bucketName });
      return key;
    } catch (error) {
      logger.error('Failed to upload file to S3', { 
        fileId, 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Upload JSON metadata to S3
   */
  async uploadMetadata(fileId: string, metadata: any): Promise<string> {
    const key = `files/${fileId}/metadata.json`;
    
    try {
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: 'application/json'
      }));

      logger.info('Metadata uploaded to S3', { fileId, key });
      return key;
    } catch (error) {
      logger.error('Failed to upload metadata to S3', { 
        fileId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Get file from S3
   */
  async getFile(fileId: string, fileName: string): Promise<Buffer> {
    const key = `files/${fileId}/${fileName}`;
    
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));

      if (!response.Body) {
        throw new Error('File body is empty');
      }

      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('Failed to get file from S3', { 
        fileId, 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Get JSON metadata from S3
   */
  async getMetadata(fileId: string): Promise<any> {
    const buffer = await this.getFile(fileId, 'metadata.json');
    return JSON.parse(buffer.toString('utf-8'));
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(fileId: string, fileName: string): Promise<boolean> {
    const key = `files/${fileId}/${fileName}`;
    
    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(fileId: string, fileName?: string): Promise<void> {
    const key = fileName ? `files/${fileId}/${fileName}` : `files/${fileId}/`;
    
    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }));

      logger.info('File deleted from S3', { fileId, key });
    } catch (error) {
      logger.error('Failed to delete file from S3', { 
        fileId, 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Generate pre-signed URL for file download (for export functionality)
   */
  async getDownloadUrl(fileId: string, fileName: string, expiresIn: number = 3600): Promise<string> {
    const key = `files/${fileId}/${fileName}`;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      
      logger.info('Generated download URL', { fileId, key, expiresIn });
      return url;
    } catch (error) {
      logger.error('Failed to generate download URL', { 
        fileId, 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }
}

export const s3Service = new S3Service();
