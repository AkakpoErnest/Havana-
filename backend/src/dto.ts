import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { Category, Condition, Direction, IdentityType, ItemStatus, Mode } from '@prisma/client';
import { Type } from 'class-transformer';
export class OtpDto {
  @IsEnum(IdentityType) type!: IdentityType;
  @IsString() @Length(5,254) value!: string;
}
export class VerifyDto {
  @IsUUID() challengeId!: string;
  @Matches(/^\d{6}$/) code!: string;
}
export class ProfileDto {
  @IsOptional() @IsString() @Length(2,60) name?: string;
  @IsOptional() @IsString() @Length(2,80) area?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
export class ListingDto {
  @IsString() @Length(3,100) title!: string;
  @IsString() @Length(5,2000) description!: string;
  @IsEnum(Category) category!: Category;
  @IsEnum(Condition) condition!: Condition;
  @IsBoolean() sell!: boolean;
  @IsBoolean() swap!: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(10000000) price?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000000) swapValue?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @IsString({each:true}) photos!: string[];
  @IsString() @Length(2,80) area!: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
export class FeedDto {
  @IsOptional() @IsEnum(Mode) mode: Mode = 'SHOP';
  @IsOptional() @IsEnum(Category) category?: Category;
  @IsOptional() @Type(()=>Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(()=>Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
export class StatusDto { @IsEnum(ItemStatus) status!: ItemStatus; }
export class SwipeDto {
  @IsUUID() itemId!: string;
  @IsEnum(Mode) mode!: Mode;
  @IsEnum(Direction) direction!: Direction;
}
export class ConversationDto { @IsUUID() itemId!: string; }
export class TextDto { @IsString() @Length(1,2000) text!: string; }
export class OfferDto { @IsInt() @Min(1) @Max(10000000) amount!: number; }
export class OfferActionDto { @IsEnum({ACCEPT:'ACCEPT',DECLINE:'DECLINE'}) action!: 'ACCEPT'|'DECLINE'; }
export class SwapActionDto { @IsEnum({AGREE:'AGREE',DONE:'DONE'}) action!: 'AGREE'|'DONE'; }
export class RatingDto {
  @IsUUID() toId!: string;
  @IsInt() @Min(1) @Max(5) stars!: number;
}
export class ReportDto { @IsString() @Length(5,500) reason!: string; }
export class MessagesDto {
  @IsOptional() @IsString() @MaxLength(100) before?: string;
  // Poll cursor: pass the previous response's `cursor` to get only new or changed messages.
  @IsOptional() @IsString() @MaxLength(100) since?: string;
}
