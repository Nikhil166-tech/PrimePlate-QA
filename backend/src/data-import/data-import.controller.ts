import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../common/roles.enum';
import { DataImportService } from './data-import.service';
import {
  PreviewImportDto,
  ExecuteImportDto,
  ValidationReport,
  PreviewReport,
  ExecutionReport,
} from './dto/data-import.dto';

@ApiTags('Admin Data Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/data-import')
export class DataImportController {
  constructor(private readonly importService: DataImportService) {}

  @ApiOperation({ summary: 'Validate uploaded production export ZIP package' })
  @ApiConsumes('multipart/form-data')
  @Post('validate')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  async validatePackage(
    @UploadedFile() file: any,
  ): Promise<ValidationReport> {
    if (!file || !file.buffer) {
      throw new BadRequestException('A ZIP package file is required.');
    }
    return this.importService.validatePackage(file.buffer);
  }

  @ApiOperation({ summary: 'Preview import effects and required confirmation phrase' })
  @Post('preview')
  async previewImport(@Body() dto: PreviewImportDto): Promise<PreviewReport> {
    return this.importService.getPreview(dto.packageToken, dto.mode);
  }

  @ApiOperation({ summary: 'Execute transactional production data import into QA' })
  @Post('execute')
  async executeImport(
    @Body() dto: ExecuteImportDto,
    @Request() req: any,
  ): Promise<ExecutionReport> {
    const adminUser = {
      id: req.user?.userId || req.user?.id || 'admin',
      email: req.user?.email || 'admin@primeplate.test',
    };
    return this.importService.executeImport(
      dto.packageToken,
      dto.mode,
      dto.confirmationPhrase,
      adminUser,
    );
  }

  @ApiOperation({ summary: 'Get active import progress' })
  @Get('progress/:token')
  getProgress(@Param('token') token: string) {
    return this.importService.getProgress(token);
  }

  @ApiOperation({ summary: 'Get data import history audit records' })
  @Get()
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.importService.getImportHistory(parsedLimit, parsedOffset);
  }

  @ApiOperation({ summary: 'Get detailed audit record for an import by ID' })
  @Get(':id')
  async getImportDetail(@Param('id') id: string) {
    return this.importService.getImportById(id);
  }
}
