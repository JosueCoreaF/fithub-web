import React, { useId, useState } from 'react';
import { type EntityImageKind, useStoredImage } from '../lib/mediaStore';

type EditableEntityImageProps = {
  kind: EntityImageKind;
  entityId: string;
  alt: string;
  fallback: string;
  variant?: 'square' | 'banner' | 'profile';
  className?: string;
  editable?: boolean;
};

export const EditableEntityImage: React.FC<EditableEntityImageProps> = ({
  kind,
  entityId,
  alt,
  fallback,
  variant = 'square',
  className = '',
  editable = true,
}) => {
  const inputId = useId();
  const { imageUrl, saveImage, clearImage, source, syncing } = useStoredImage(kind, entityId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await saveImage(file);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'No se pudo guardar la imagen.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  return (
    <div className={`editable-entity-image ${variant} ${className}`.trim()}>
      <div className="editable-entity-image-frame">
        {imageUrl ? (
          <img src={imageUrl} alt={alt} className="editable-entity-image-preview" />
        ) : (
          <div className="editable-entity-image-fallback">{fallback}</div>
        )}
      </div>

      {editable && (
        <div className="editable-entity-image-actions">
          <label htmlFor={inputId} className="btn ghost small editable-image-button">
            {loading || syncing ? 'Procesando...' : imageUrl ? 'Cambiar foto' : 'Subir foto'}
          </label>
          <input id={inputId} type="file" accept="image/*" className="sr-only-input" onChange={handleFileChange} />
          {imageUrl && (
            <button type="button" className="btn ghost small editable-image-button" onClick={() => { void clearImage(); }}>
              Quitar
            </button>
          )}
        </div>
      )}

      {source && <span className="editable-entity-image-hint">Guardada en {source === 'remote' ? 'Storage' : 'navegador local'}.</span>}
      {error && <span className="editable-entity-image-error">{error}</span>}
    </div>
  );
};

export default EditableEntityImage;