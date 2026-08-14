import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WithdrawDto {
  @ApiProperty({
    description: 'Asset to withdraw',
    enum: ['XLM', 'USDC'],
    example: 'XLM',
  })
  @IsIn(['XLM', 'USDC'])
  asset!: 'XLM' | 'USDC';

  @ApiProperty({
    description: 'Amount to withdraw (positive decimal string)',
    example: '50.0000000',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, { message: 'Amount must be a positive decimal' })
  amount!: string;

  @ApiProperty({
    description: 'Destination Stellar G-address',
    example: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'Invalid Stellar public key' })
  destinationAddress!: string;
}
