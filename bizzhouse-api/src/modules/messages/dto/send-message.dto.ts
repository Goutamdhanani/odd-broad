import {
  IsString,
  IsOptional,
  IsIn,
  IsNotEmpty,
  IsArray,
  IsUrl,
  ValidateIf,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  contactWaId: string;

  @IsString()
  @IsIn(['text', 'template', 'image', 'video', 'document', 'audio'])
  type: string;

  // For text messages — required when type=text
  @ValidateIf((o) => o.type === 'text')
  @IsString()
  @IsNotEmpty({ message: 'text must not be empty for text messages' })
  @MaxLength(4096)
  text?: string;

  // For template messages — required when type=template
  @ValidateIf((o) => o.type === 'template')
  @IsString()
  @IsNotEmpty({ message: 'templateName is required for template messages' })
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  templateComponents?: any[];

  // Positional values for the template's {{1}}, {{2}}… body variables.
  // Built into Meta body components server-side; length must match the
  // variable count exactly.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateValues?: string[];

  // For media messages — either a public HTTPS link OR a mediaId from
  // POST /media/upload (Meta id-based send). One of the two is required.
  @ValidateIf(
    (o) => ['image', 'video', 'document', 'audio'].includes(o.type) && !o.mediaId,
  )
  @IsUrl(
    { require_tld: false },
    { message: 'mediaUrl must be a valid HTTPS URL the provider can fetch' },
  )
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  mediaId?: string;

  // Internal preview URL (object storage) persisted with the message so
  // history keeps rendering the attachment; never sent to the provider.
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  mediaPreviewUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  filename?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  // Optional gupshup_app_id to pin the sending number (spec §2.4).
  // Omitted = the health-aware router picks the best live number.
  @IsOptional()
  @IsString()
  gupshupAppId?: string;

  // Set by the broadcast dispatcher so status webhooks roll up into the
  // campaign's live summary (spec §2.1).
  @IsOptional()
  @IsString()
  broadcastId?: string;
}
