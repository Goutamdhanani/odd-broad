import { IsString, IsEnum, IsOptional, IsArray, IsIn, Matches, MaxLength } from 'class-validator';
import { TemplateCategory } from '../entities/template.entity';

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
  @IsString()
  @MaxLength(60)
  headerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footerText?: string;

  @IsOptional()
  @IsArray()
  buttons?: Array<string | TemplateButtonDto>;
}
