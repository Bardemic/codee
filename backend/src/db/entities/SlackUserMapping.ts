import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity()
@Unique(['slackTeamId', 'slackUserId'])
@Index(['codeeUserId'])
export class SlackUserMapping {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    slackTeamId!: string;

    @Column()
    slackUserId!: string;

    @Column()
    codeeUserId!: string;

    @CreateDateColumn()
    createdAt!: Date;
}
