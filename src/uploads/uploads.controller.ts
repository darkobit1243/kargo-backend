import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { S3Service } from '../common/s3.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly s3Service: S3Service) {}

  // Uber-style: client requests a signed PUT URL, uploads directly to S3, then
  // sends the returned `key` to your normal create/update endpoints.
  @Get('presign')
  @UseGuards(JwtAuthGuard)
  async presignPut(
    @Query('contentType') contentType?: string,
    @Query('prefix') prefix?: string,
  ) {
    if (!contentType || contentType.trim().length === 0) {
      throw new BadRequestException('contentType is required');
    }

    const subtype = contentType.split('/')[1] || 'bin';
    const extension = subtype === 'jpeg' ? 'jpg' : subtype;

    return this.s3Service.getSignedPutUrl({
      contentType,
      pathPrefix: prefix || 'uploads',
      extension,
    });
  }
}
