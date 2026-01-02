/**
 * Client-side Export (React Native)
 * 
 * Handles PNG generation using react-native-view-shot
 */

import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
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
 * Export a prop card to PNG using React Native view capture
 * 
 * @param viewRef - Reference to the ShareCard component
 * @param propCard - The prop card data
 * @param options - Export options (theme, viewMode)
 * @param firebaseConfig - Firebase auth and API config
 * @returns Export response with signed URL
 */
export async function exportPropCardMobile(
  viewRef: any,
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

    // Step 4: Capture view as PNG
    onProgress?.('Rendering PNG...');
    const localUri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    // Read file as base64
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists) {
      throw new ExportError('Failed to capture view', ExportErrorCode.RENDER_FAILED);
    }

    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const sizeBytes = fileInfo.size || 0;

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
        sizeBytes,
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
      body: base64ToBlob(base64, 'image/png'),
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
        sizeBytes,
      }),
    });

    if (!registerResponse.ok) {
      throw new ExportError('Failed to register export', ExportErrorCode.UNKNOWN_ERROR);
    }

    const exportResponse: ExportResponse = await registerResponse.json();

    // Clean up temp file
    await FileSystem.deleteAsync(localUri, { idempotent: true });

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
 * Convert base64 to Blob (for upload)
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Share exported PNG using native share dialog
 */
export async function shareExportMobile(
  signedUrl: string,
  propCard: PropCard
): Promise<void> {
  // Download to temp directory
  const fileUri = `${FileSystem.cacheDirectory}prop-card-${Date.now()}.png`;
  
  const downloadResult = await FileSystem.downloadAsync(signedUrl, fileUri);
  
  if (!downloadResult.uri) {
    throw new Error('Failed to download export');
  }

  // Check if sharing is available
  const isAvailable = await Sharing.isAvailableAsync();
  
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  // Share using native dialog
  await Sharing.shareAsync(downloadResult.uri, {
    mimeType: 'image/png',
    dialogTitle: `${propCard.meta.playerName} - ${propCard.meta.statType}`,
    UTI: 'public.png',
  });

  // Clean up temp file after a delay (user might need time to share)
  setTimeout(async () => {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  }, 60000); // 1 minute
}

/**
 * Save export to device's photo library
 */
export async function saveExportToLibrary(signedUrl: string): Promise<void> {
  const MediaLibrary = await import('expo-media-library');

  // Request permissions
  const { status } = await MediaLibrary.requestPermissionsAsync();
  
  if (status !== 'granted') {
    throw new Error('Permission to access media library denied');
  }

  // Download to temp directory
  const fileUri = `${FileSystem.cacheDirectory}prop-card-${Date.now()}.png`;
  const downloadResult = await FileSystem.downloadAsync(signedUrl, fileUri);

  if (!downloadResult.uri) {
    throw new Error('Failed to download export');
  }

  // Save to media library
  await MediaLibrary.saveToLibraryAsync(downloadResult.uri);

  // Clean up temp file
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

/**
 * Hook for React Native components to use export functionality
 */
export function useExport(firebaseConfig: {
  authToken: string;
  apiBaseUrl: string;
}) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [progress, setProgress] = React.useState<string>('');
  const [error, setError] = React.useState<ExportError | null>(null);

  const exportCard = async (
    viewRef: any,
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
      const result = await exportPropCardMobile(
        viewRef,
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
