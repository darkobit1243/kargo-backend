import { Module, Global } from '@nestjs/common';
import { S3Service } from './s3.service';
import { PostgisInitService } from './postgis-init.service';

@Global()
@Module({
  providers: [S3Service, PostgisInitService],
  exports: [S3Service],
})
export class CommonModule {}
