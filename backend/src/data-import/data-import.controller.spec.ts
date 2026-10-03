import { Test, TestingModule } from '@nestjs/testing';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { BadRequestException } from '@nestjs/common';
import { ImportMode } from './data-import.entity';

describe('DataImportController', () => {
  let controller: DataImportController;
  let service: any;

  beforeEach(async () => {
    service = {
      validatePackage: jest.fn().mockResolvedValue({ valid: true, packageToken: 'PKG-123' }),
      getPreview: jest.fn().mockResolvedValue({ mode: ImportMode.MERGE, estimatedCounts: { total: 10 } }),
      executeImport: jest.fn().mockResolvedValue({ status: 'COMPLETED', insertedCount: 10 }),
      getProgress: jest.fn().mockReturnValue({ stage: 'Completed', percent: 100 }),
      getImportHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getImportById: jest.fn().mockResolvedValue({ id: 'import-uuid', importId: 'IMP-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataImportController],
      providers: [{ provide: DataImportService, useValue: service }],
    }).compile();

    controller = module.get<DataImportController>(DataImportController);
  });

  it('should reject validation if file is missing', async () => {
    await expect(controller.validatePackage(null as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should call validatePackage with buffer when file is provided', async () => {
    const file = { buffer: Buffer.from('test') };
    const res = await controller.validatePackage(file as any);
    expect(res.valid).toBe(true);
    expect(service.validatePackage).toHaveBeenCalledWith(file.buffer);
  });

  it('should preview import', async () => {
    const res = await controller.previewImport({ packageToken: 'PKG-123', mode: ImportMode.MERGE });
    expect(res.mode).toBe(ImportMode.MERGE);
    expect(service.getPreview).toHaveBeenCalledWith('PKG-123', ImportMode.MERGE);
  });

  it('should execute import passing admin user context', async () => {
    const req = { user: { userId: 'admin-1', email: 'admin@primeplate.test' } };
    const res = await controller.executeImport(
      { packageToken: 'PKG-123', mode: ImportMode.MERGE, confirmationPhrase: 'yes' },
      req,
    );
    expect(res.status).toBe('COMPLETED');
    expect(service.executeImport).toHaveBeenCalledWith(
      'PKG-123',
      ImportMode.MERGE,
      'yes',
      { id: 'admin-1', email: 'admin@primeplate.test' },
    );
  });

  it('should fetch history with pagination params', async () => {
    await controller.getHistory('10', '20');
    expect(service.getImportHistory).toHaveBeenCalledWith(10, 20);
  });

  it('should get import detail by id', async () => {
    const res = await controller.getImportDetail('IMP-1');
    expect(res.importId).toBe('IMP-1');
    expect(service.getImportById).toHaveBeenCalledWith('IMP-1');
  });

  it('should get import progress by token', () => {
    const res = controller.getProgress('PKG-123');
    expect(res.percent).toBe(100);
    expect(service.getProgress).toHaveBeenCalledWith('PKG-123');
  });
});
