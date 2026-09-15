import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ContactsService } from './contacts.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { normalizePhone } from '../../shared/phone.util';

@Controller('contacts')
@UseGuards(AuthGuard('jwt'))
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async list(
    @CurrentTenant('shopId') shopId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 30,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.contactsService.findAll(shopId, page, limit, search, tag);
  }

  // Must be declared BEFORE ':id' so "export" is not matched as a param.
  @Get('export')
  async exportCsv(
    @Res() res: Response,
    @CurrentTenant('shopId') shopId: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    const csv = await this.contactsService.exportCsv(shopId, search, tag);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bizzhouse-contacts-${Date.now()}.csv"`,
    );
    // BOM so Excel opens UTF-8 names correctly
    res.send('\uFEFF' + csv);
  }

  @Get(':id')
  async getOne(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.contactsService.findById(shopId, id);
  }

  @Post()
  async create(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: { waId: string; name?: string; tags?: string[] },
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    // Normalize to E.164 digit form (adds the 91 prefix to local numbers)
    const normalizedWaId = normalizePhone(dto.waId || '');
    if (!normalizedWaId || normalizedWaId.length < 10) {
      throw new BadRequestException('waId must be a valid WhatsApp number (e.g. 9876543210 or 919876543210)');
    }
    return this.contactsService.create(shopId, { ...dto, waId: normalizedWaId });
  }

  @Patch(':id')
  async update(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
    @Body() dto: { name?: string; tags?: string[]; optedIn?: boolean },
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.contactsService.update(shopId, id, dto);
  }

  @Post('import')
  async importContacts(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: { contacts: Array<{ waId: string; name?: string; tags?: string[] }> },
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    if (!Array.isArray(dto.contacts) || dto.contacts.length === 0) {
      throw new BadRequestException('contacts array must not be empty');
    }
    if (dto.contacts.length > 5000) {
      throw new BadRequestException('Maximum 5000 contacts per import batch');
    }
    return this.contactsService.bulkImport(shopId, dto.contacts);
  }
}
