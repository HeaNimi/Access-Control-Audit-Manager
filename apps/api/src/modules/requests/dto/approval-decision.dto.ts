import { IsIn, IsOptional, IsString } from 'class-validator';

export class ApprovalDecisionDto {
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  decisionComment?: string;
}
