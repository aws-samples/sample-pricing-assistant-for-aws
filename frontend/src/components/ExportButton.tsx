import React, { useState } from 'react';

interface ExportButtonProps {
  fileId: string;
  fileName: string;
  className?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ 
  fileId, 
  fileName, 
  className = '' 
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      const response = await fetch(`/api/files/${fileId}/download`);
      
      if (!response.ok) {
        throw new Error('Failed to generate download URL');
      }
      
      const { downloadUrl, fileName: originalFileName } = await response.json();
      
      // Open download URL in new tab
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = originalFileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`
        inline-flex items-center gap-2 px-3 py-1 text-sm
        bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
        text-white rounded-md transition-colors
        ${className}
      `}
      title={`Export ${fileName}`}
    >
      {isExporting ? (
        <>
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export
        </>
      )}
    </button>
  );
};
