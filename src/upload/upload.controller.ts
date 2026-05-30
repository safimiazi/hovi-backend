import {
  Controller,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService, UploadResult } from './upload.service';
import { Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Upload a single image.
   * POST /api/upload/image
   * Body: multipart/form-data with field "file"
   * Returns: { url, publicId, width, height, format, bytes }
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided. Use field name "file".');
    }
    return this.uploadService.uploadImage(file, 'products');
  }

  /**
   * Upload multiple images (max 10).
   * POST /api/upload/images
   * Body: multipart/form-data with field "files" (multiple)
   * Returns: UploadResult[]
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided. Use field name "files".');
    }
    return this.uploadService.uploadImages(files, 'products');
  }

  /**
   * Upload a category image.
   * POST /api/upload/category-image
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('category-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCategoryImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided.');
    }
    return this.uploadService.uploadImage(file, 'categories');
  }

  /**
   * Delete an image by public ID.
   * DELETE /api/upload/:publicId
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(':publicId')
  async deleteImage(@Param('publicId') publicId: string): Promise<{ message: string }> {
    await this.uploadService.deleteImage(publicId);
    return { message: 'Image deleted successfully' };
  }
}
