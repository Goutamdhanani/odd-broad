import { IsString, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';

export class CreateBroadcastDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  templateName: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  templateComponents?: any[];

  // Positional values for the template's {{1}}, {{2}}… body variables,
  // applied identically to every recipient.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyVariables?: string[];

  /**
   * Optional tag filter. When omitted the broadcast targets every
   * opted-in contact of the shop.
   */
  @IsOptional()
  @IsString()
  audienceTag?: string;
}
