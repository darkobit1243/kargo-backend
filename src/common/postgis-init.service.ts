import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PostgisInitService implements OnModuleInit {
  private readonly logger = new Logger(PostgisInitService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      this.logger.log('Checking/Enabling PostGIS extension...');
      await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS postgis;');
      this.logger.log('PostGIS extension enabled.');
    } catch (e) {
      this.logger.error(`Failed to enable PostGIS: ${e.message}`);
      // Don't crash; maybe it's already there or user lacks permissions
    }
  }
}
