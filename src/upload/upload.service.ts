import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

export interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Upload a single image buffer to Cloudinary.
   * Applies server-side optimization: auto quality, auto format, max width 1200px.
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'products',
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed: JPEG, PNG, WebP, AVIF`,
      );
    }

    // Max 5MB (after client-side compression, should be much smaller)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    try {
      const result = await this.uploadToCloudinary(file.buffer, folder);

      this.logger.log(
        `Image uploaded: ${result.public_id} (${result.bytes} bytes, ${result.width}x${result.height})`,
      );

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (error: any) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException('Image upload failed. Please try again.');
    }
  }

  /**
   * Upload multiple images. Returns array of results.
   */
  async uploadImages(
    files: Express.Multer.File[],
    folder: string = 'products',
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > 10) {
      throw new BadRequestException('Maximum 10 images allowed per upload');
    }

    const results = await Promise.all(
      files.map((file) => this.uploadImage(file, folder)),
    );

    return results;
  }

  /**
   * Delete an image from Cloudinary by public ID.
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Image deleted: ${publicId}`);
    } catch (error: any) {
      this.logger.error(`Delete failed for ${publicId}: ${error.message}`);
    }
  }

  /**
   * Internal: stream buffer to Cloudinary with transformations.
   */
  private uploadToCloudinary(
    buffer: Buffer,
    folder: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `hovi/${folder}`,
          resource_type: 'image',
          // Server-side optimization
          transformation: [
            { width: 1200, crop: 'limit' }, // Max width 1200px, maintain aspect ratio
            { quality: 'auto:good' },        // Auto quality optimization
            { fetch_format: 'auto' },        // Serve best format (WebP/AVIF) based on browser
          ],
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No result from Cloudinary'));
          resolve(result);
        },
      );

      // Pipe buffer to upload stream
      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }
}
