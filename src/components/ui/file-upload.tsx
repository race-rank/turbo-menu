import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from './button';
import { Label } from './label';

interface FileUploadProps {
  label: string;
  value: string;
  onChange: (base64: string) => void;
  accept?: string;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  value,
  onChange,
  accept = "image/*",
  className = ""
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        const maxDimension = 800; // Max width or height
        
        if (width > height) {
          if (width > maxDimension) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Start with high quality and reduce until we hit size target
        let quality = 0.9;
        const maxSize = 1048487; // ~1MB in bytes
        
        const tryCompress = () => {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64Size = (dataUrl.length * 3) / 4; // Approximate base64 size
          
          if (base64Size <= maxSize || quality <= 0.1) {
            resolve(dataUrl);
          } else {
            quality -= 0.1;
            setTimeout(tryCompress, 10); // Async to prevent blocking
          }
        };
        
        tryCompress();
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsUploading(true);

    try {
      let base64: string;
      
      // If file is already small enough, use as-is
      if (file.size <= 1048487) {
        const reader = new FileReader();
        base64 = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('Error reading file'));
          reader.readAsDataURL(file);
        });
      } else {
        // Compress the image
        base64 = await compressImage(file);
      }
      
      onChange(base64);
      setIsUploading(false);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file');
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      {value ? (
        <div className="relative border-2 border-dashed border-border rounded-lg p-4">
          <img 
            src={value} 
            alt="Preview" 
            className="max-w-full max-h-32 object-cover rounded mx-auto mb-2"
          />
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerFileSelect}
              disabled={isUploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              Change
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
            >
              <X className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div 
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={triggerFileSelect}
        >
          <div className="flex flex-col items-center gap-2">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isUploading ? 'Processing...' : 'Click to upload image'}
            </p>
            <p className="text-xs text-muted-foreground">
              Max 10MB • Auto-compressed • PNG, JPG, GIF
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
