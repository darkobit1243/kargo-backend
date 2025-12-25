import { Module, Global } from '@nestjs/common';
import { S3Service } from './s3.service';
import { MailService } from './mail.service';
@Global()
@Module({
  providers: [S3Service, MailService],
  exports: [S3Service, MailService],
})
export class CommonModule { }
