import { IsObject, IsString } from 'class-validator';

export class CreateChangeRequestDto {
  @IsString()
  title!: string;

  @IsString()
  justification!: string;

  @IsString()
  approverUsername!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
