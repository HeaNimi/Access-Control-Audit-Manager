import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ObservedEventIngestDto {
  @IsString()
  eventSource!: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  @IsNotEmpty()
  sourceReference!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  eventId?: number | null;

  @IsISO8601()
  eventTime!: string;

  @IsOptional()
  @IsString()
  eventType?: string | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  message?: string | null;

  @IsOptional()
  @IsString()
  objectGuid?: string | null;

  @IsOptional()
  @IsString()
  distinguishedName?: string | null;

  @IsOptional()
  @IsString()
  samAccountName?: string | null;

  @IsOptional()
  @IsString()
  subjectAccountName?: string | null;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
