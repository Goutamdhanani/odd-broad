import { IsString, IsOptional, IsArray, IsBoolean, MinLength, MaxLength } from 'class-validator';

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

  /**
   * Optional gupshup_app_id to pin the sending number (spec §2.4).
   * Omitted = the health-aware router picks the best live number.
   */
  @IsOptional()
  @IsString()
  gupshupAppId?: string;

  /**
   * Explicit confirmation required to send on a RED/flagged pinned number
   * (spec §2.3 — warning-and-confirm before Meta penalizes the number).
   */
  @IsOptional()
  @IsBoolean()
  confirmUnhealthyNumber?: boolean;
}
