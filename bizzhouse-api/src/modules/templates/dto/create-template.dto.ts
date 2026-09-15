import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsIn,
  Matches,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateCategory, TemplateType } from '../entities/template.entity';

/**
 * Button descriptor matching Gupshup's template button API.
 * Plain strings are also accepted (treated as QUICK_REPLY).
 */
export class TemplateButtonDto {
  @IsOptional()
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  type?: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

  @IsString()
  @MaxLength(25)
  text: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

/**
 * One carousel card — Gupshup's exact `cards[]` entry shape
 * (headerType, mediaId, body, sampleText, buttons).
 */
export class CarouselCardDto {
  @IsIn(['IMAGE', 'VIDEO'])
  headerType: 'IMAGE' | 'VIDEO';

  /** Real mediaId from POST /templates/media (upload) — mandatory */
  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsString()
  @MaxLength(160, { message: 'Carousel card body is limited to 160 characters (Meta limit)' })
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sampleText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1, { message: 'A carousel card allows at most 1 button (Meta limit)' })
  @ValidateNested({ each: true })
  @Type(() => CarouselCardButtonDto)
  buttons?: CarouselCardButtonDto[];
}

export class CarouselCardButtonDto {
  @IsIn(['URL', 'QUICK_REPLY'])
  type: 'URL' | 'QUICK_REPLY';

  @IsString()
  @MaxLength(25)
  text: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class CreateTemplateDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Template name must contain only lowercase alphanumeric characters and underscores',
  })
  elementName: string;

  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @IsString()
  @IsOptional()
  language?: string = 'en_US';

  @IsString()
  @MaxLength(1028, { message: 'Template body must be at most 1028 characters (Meta limit)' })
  body: string;

  @IsOptional()
  @IsEnum(TemplateType)
  templateType?: TemplateType = TemplateType.TEXT;

  /** Required when templateType=CAROUSEL — 2-10 cards (Meta limit) */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2, { message: 'A carousel needs at least 2 cards (Meta limit)' })
  @ArrayMaxSize(10, { message: 'A carousel allows at most 10 cards (Meta limit)' })
  @ValidateNested({ each: true })
  @Type(() => CarouselCardDto)
  cards?: CarouselCardDto[];

  @IsOptional()
  @IsString()
  @MaxLength(180)
  vertical?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footerText?: string;

  @IsOptional()
  @IsString()
  example?: string;

  @IsOptional()
  @IsArray()
  buttons?: Array<string | TemplateButtonDto>;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(1028)
  body?: string;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footerText?: string;

  @IsOptional()
  @IsString()
  example?: string;

  @IsOptional()
  @IsArray()
  buttons?: Array<string | TemplateButtonDto>;
}

export class UploadTemplateMediaDto {
  /** MIME type, e.g. image/jpeg — matches Gupshup's file_type field */
  @IsDefined()
  @IsString()
  fileType: string;
}
