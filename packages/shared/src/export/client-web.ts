/**
 * Client-side Export (Web)
 * 
 * Handles PNG generation using html-to-image on the client side
 */

import { toPng } from 'html-to-image';
import { PropCard } from '@proppulse/shared/prop-card';
import {
  ExportRequest,
  ExportResponse,
  ThemeMode,
  ViewMode,
  ExportError,
  ExportErrorCode,
} from '@proppulse/shared/export/types';
import { generateExportHash } from '@proppulse/shared/export/hash';

/**
 * Export a prop card to PNG using client-side rendering
 * 
 * @param element - The ShareCard DOM element to capture
 * @param propCard - The prop card data
 * @param options - Export options (theme, viewMode)
 * @param firebaseConfig - Firebase auth and API config
 * @returns Export response with signed URL
 */
export async function exportPropCardWeb(
  element: HTMLElement,
  propCard: PropCard,
  options: {
    theme?: ThemeMode;
    viewMode?: ViewMode;
    onProgress?: (status: string) => void;
  } = {},
  firebaseConfig: {
    authToken: string;
    apiBaseUrl: string;
  }
): Promise<ExportResponse> {
  const { theme = 'LIGHT', viewMode = 'CASUAL', onProgress } = options;
  const { authToken, apiBaseUrl } = firebaseConfig;

  try {
    // Step 1: Generate hash for caching
    onProgress?.('Generating hash...');
    const hash = generateExportHash(propCard, viewMode, theme);

    // Step 2: Check if already cached (via API)
    onProgress?.('Checking cache...');
    const cacheResponse = await fetch(`${apiBaseUrl}/api/export/check-cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ hash }),
    });

    if (cacheResponse.ok) {
      const cachedExport = await cacheResponse.json();
      onProgress?.('Using cached export');
      return cachedExport;
    }

    // Step 3: Check quota before rendering
    onProgress?.('Checking quota...');
    const quotaResponse = await fetch(`${apiBaseUrl}/api/export/check-quota`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!quotaResponse.ok) {
      const quotaError = await quotaResponse.json();
      throw new ExportError(
        quotaError.message || 'Export quota exceeded',
        ExportErrorCode.QUOTA_EXCEEDED
      );
    }

    // Step 4: Render to PNG using html-to-image
    onProgress?.('Rendering PNG...');
    const dataUrl = await toPng(element, {
      pixelRatio: 2, // 2x scale for high quality
      cacheBust: true,
      backgroundColor: theme === 'LIGHT' ? '#ffffff' : '#1f2937',
    });

    // Convert data URL to Blob
    const blob = await dataUrlToBlob(dataUrl);

    // Step 5: Get upload URL
    onProgress?.('Requesting upload URL...');
    const uploadUrlResponse = await fetch(`${apiBaseUrl}/api/export/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        hash,
        contentType: 'image/png',
        sizeBytes: blob.size,
      }),
    });

    if (!uploadUrlResponse.ok) {
      throw new ExportError('Failed to get upload URL', ExportErrorCode.UPLOAD_FAILED);
    }

    const { uploadUrl, storagePath } = await uploadUrlResponse.json();

    // Step 6: Upload to Firebase Storage
    onProgress?.('Uploading to storage...');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new ExportError('Failed to upload PNG', ExportErrorCode.UPLOAD_FAILED);
    }

    // Step 7: Register export metadata
    onProgress?.('Saving metadata...');
    const registerResponse = await fetch(`${apiBaseUrl}/api/export/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        hash,
        storagePath,
        propCard,
        viewMode,
        theme,
        sizeBytes: blob.size,
      }),
    });

    if (!registerResponse.ok) {
      throw new ExportError('Failed to register export', ExportErrorCode.UNKNOWN_ERROR);
    }

    const exportResponse: ExportResponse = await registerResponse.json();

    onProgress?.('Export complete!');
    return exportResponse;
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new ExportError(
        `Export failed: ${error.message}`,
        ExportErrorCode.RENDER_FAILED
      );
    }

    throw new ExportError('Unknown export error', ExportErrorCode.UNKNOWN_ERROR);
  }
}

/**
 * Convert data URL to Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Download exported PNG to user's device
 */
export function downloadExport(signedUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = signedUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Share export using Web Share API (if available)
 */
export async function shareExport(
  signedUrl: string,
  propCard: PropCard
): Promise<void> {
  if (!navigator.share) {
    throw new Error('Web Share API not supported');
  }

  // Fetch the image as a Blob
  const response = await fetch(signedUrl);
  const blob = await response.blob();

  const file = new File([blob], 'prop-card.png', { type: 'image/png' });

  const shareData: ShareData = {
    title: `${propCard.meta.playerName} - ${propCard.meta.statType}`,
    text: `Check out this ${propCard.meta.side} ${propCard.meta.line} ${propCard.meta.statType} prop for ${propCard.meta.playerName}`,
    files: [file],
  };

  await navigator.share(shareData);
}

/**
 * Copy export URL to clipboard
 */
export async function copyExportUrl(signedUrl: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(signedUrl);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = signedUrl;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Hook for React components to use export functionality
 */
export function useExport(firebaseConfig: {
  authToken: string;
  apiBaseUrl: string;
}) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [progress, setProgress] = React.useState<string>('');
  const [error, setError] = React.useState<ExportError | null>(null);

  const exportCard = async (
    element: HTMLElement,
    propCard: PropCard,
    options?: {
      theme?: ThemeMode;
      viewMode?: ViewMode;
    }
  ): Promise<ExportResponse | null> => {
    setIsExporting(true);
    setError(null);
    setProgress('Starting export...');

    try {
      const result = await exportPropCardWeb(
        element,
        propCard,
        {
          ...options,
          onProgress: setProgress,
        },
        firebaseConfig
      );

      setProgress('');
      return result;
    } catch (err) {
      const exportError =
        err instanceof ExportError
          ? err
          : new ExportError('Export failed', ExportErrorCode.UNKNOWN_ERROR);
      
      setError(exportError);
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  return {
    exportCard,
    isExporting,
    progress,
    error,
  };
}

// Re-export React for the hook
import React from 'react';
