import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

export type EntityImageKind = 'profile' | 'habitacion' | 'personal' | 'hotel' | 'service' | 'trainer' | 'sede';
type ImageSource = 'remote' | 'local' | null;

const normalizeEntityImageKind = (kind: EntityImageKind) => {
  if (kind === 'habitacion') return 'service';
  if (kind === 'personal') return 'trainer';
  if (kind === 'hotel') return 'sede';
  return kind;
};

const storageKey = (kind: EntityImageKind, entityId: string) => `fithub-image:${normalizeEntityImageKind(kind)}:${entityId}`;
const MEDIA_BUCKET = import.meta.env.VITE_MEDIA_BUCKET ?? 'fithub-media';
const buildRemotePath = (kind: EntityImageKind, entityId: string) => `${normalizeEntityImageKind(kind)}/${entityId}.jpg`;

export const getStoredImage = (kind: EntityImageKind, entityId: string) => {
  if (!entityId || typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey(kind, entityId));
};

export const setStoredImage = (kind: EntityImageKind, entityId: string, value: string) => {
  if (!entityId || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(kind, entityId), value);
};

export const removeStoredImage = (kind: EntityImageKind, entityId: string) => {
  if (!entityId || typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey(kind, entityId));
};

const isRemoteUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://');

const resolveRemoteImageUrl = async (kind: EntityImageKind, entityId: string) => {
  if (!entityId) return null;

  const path = buildRemotePath(kind, entityId);
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  if (!publicUrl) return null;

  try {
    const response = await fetch(publicUrl, { method: 'HEAD' });
    return response.ok ? publicUrl : null;
  } catch {
    return null;
  }
};

export const fileToCompressedDataUrl = (file: File, maxSize = 960, quality = 0.84) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => {
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    image.src = typeof reader.result === 'string' ? reader.result : '';
  };

  reader.onerror = () => reject(new Error('No se pudo cargar el archivo.'));
  reader.readAsDataURL(file);
});

export const saveEntityImage = async (kind: EntityImageKind, entityId: string, file: File) => {
  if (!entityId) {
    throw new Error('No se encontró el identificador del elemento para guardar la imagen.');
  }

  const remotePath = buildRemotePath(kind, entityId);

  try {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(remotePath, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    });

    if (error) throw error;

    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(remotePath);
    if (!data.publicUrl) {
      throw new Error('No se pudo obtener la URL pública de la imagen.');
    }

    setStoredImage(kind, entityId, data.publicUrl);
    return { url: data.publicUrl, source: 'remote' as const };
  } catch {
    const dataUrl = await fileToCompressedDataUrl(file);
    setStoredImage(kind, entityId, dataUrl);
    return { url: dataUrl, source: 'local' as const };
  }
};

export const clearEntityImage = async (kind: EntityImageKind, entityId: string) => {
  if (!entityId) return;

  try {
    await supabase.storage.from(MEDIA_BUCKET).remove([buildRemotePath(kind, entityId)]);
  } catch {
    // Fallback silencioso: la imagen local igual se limpia.
  }

  removeStoredImage(kind, entityId);
};

export const useStoredImage = (kind: EntityImageKind, entityId: string) => {
  const stableEntityId = useMemo(() => entityId || '', [entityId]);
  const [imageUrl, setImageUrl] = useState<string | null>(() => getStoredImage(kind, stableEntityId));
  const [source, setSource] = useState<ImageSource>(() => {
    const stored = getStoredImage(kind, stableEntityId);
    if (!stored) return null;
    return isRemoteUrl(stored) ? 'remote' : 'local';
  });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const stored = getStoredImage(kind, stableEntityId);
    if (stored) {
      setImageUrl(stored);
      setSource(isRemoteUrl(stored) ? 'remote' : 'local');
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      setSyncing(true);
      const remoteUrl = await resolveRemoteImageUrl(kind, stableEntityId);
      if (cancelled) return;
      if (remoteUrl) {
        setStoredImage(kind, stableEntityId, remoteUrl);
        setImageUrl(remoteUrl);
        setSource('remote');
      } else {
        setImageUrl(null);
        setSource(null);
      }
      setSyncing(false);
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [kind, stableEntityId]);

  const saveImage = async (file: File) => {
    setSyncing(true);
    const result = await saveEntityImage(kind, stableEntityId, file);
    setImageUrl(result.url);
    setSource(result.source);
    setSyncing(false);
  };

  const clearImage = async () => {
    setSyncing(true);
    await clearEntityImage(kind, stableEntityId);
    setImageUrl(null);
    setSource(null);
    setSyncing(false);
  };

  return {
    imageUrl,
    saveImage,
    clearImage,
    source,
    syncing,
  };
};