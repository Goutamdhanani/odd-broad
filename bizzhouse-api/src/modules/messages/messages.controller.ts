import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { User } from '../auth/entities/user.entity';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(AuthGuard('jwt'))
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Post('send')
  async sendMessage(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: SendMessageDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    if (dto.type === 'text' && (!dto.text || dto.text.trim().length === 0)) {
      throw new BadRequestException('Text messages must have non-empty text content');
    }
    return this.messagesService.sendMessage(shopId, dto);
  }

  @Get('conversations')
  async getConversations(
    @CurrentTenant('shopId') shopId: string,
    @CurrentUser('userId') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 30,
    @Query('assignedTo') assignedTo?: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    // "me" = conversations assigned to the requesting team member
    const assignedToUserId = assignedTo === 'me' ? userId : undefined;
    return this.messagesService.getConversations(shopId, page, limit, assignedToUserId);
  }

  @Get('conversation/:contactId')
  async getConversation(
    @CurrentTenant('shopId') shopId: string,
    @Param('contactId') contactId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.messagesService.getConversationMessages(
      shopId,
      contactId,
      page,
      limit,
    );
  }

  @Patch('conversation/:contactId/assign')
  async assignConversation(
    @CurrentTenant('shopId') shopId: string,
    @Param('contactId') contactId: string,
    @Body() dto: { assignedUserId: string | null },
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    const members = await this.userRepo.find({
      where: { shopId },
      select: { id: true },
    });
    const shopUserIds = new Set(members.map((m) => m.id));
    return this.messagesService.assignConversation(
      shopId,
      contactId,
      dto.assignedUserId ?? null,
      shopUserIds,
    );
  }
}
