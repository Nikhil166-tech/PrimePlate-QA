import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(
    file: { buffer: Buffer; mimetype?: string; size?: number },
    folder: string = 'primeplate',
  ): Promise<{ secure_url: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.mimetype && !allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type (${file.mimetype}). Allowed types: JPG, PNG, WEBP`,
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size && file.size > maxSize) {
      throw new BadRequestException('File size exceeds maximum 10MB limit');
    }

    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    const isProduction = process.env.NODE_ENV === 'production';

    const isCloudinaryConfigured =
      cloudName &&
      apiKey &&
      apiSecret &&
      cloudName !== 'your_cloudinary_cloud_name' &&
      !cloudName.includes('PLACEHOLDER') &&
      apiKey !== 'your_cloudinary_api_key' &&
      !apiKey.includes('PLACEHOLDER');

    if (!isCloudinaryConfigured) {
      if (isProduction) {
        throw new BadRequestException(
          'Cloudinary configuration missing in production environment. Upload failed.',
        );
      }
      // Return the exact uploaded file buffer as a Data URI so the exact user-uploaded image is preserved and rendered identically
      const mime = file.mimetype || 'image/jpeg';
      const base64Data = file.buffer.toString('base64');
      return {
        secure_url: `data:${mime};base64,${base64Data}`,
      };
    }

    const targetFolder =
      this.config.get<string>('CLOUDINARY_FOLDER') || folder;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: targetFolder },
        (error, result) => {
          if (error)
            reject(
              new BadRequestException(
                error.message || 'Cloudinary upload error',
              ),
            );
          else resolve(result as { secure_url: string });
        },
      );
      uploadStream.end(file.buffer);
    });
  }
}
