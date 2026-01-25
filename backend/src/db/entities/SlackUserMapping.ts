import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity()
@Unique(['slackTeamId', 'slackUserId'])
@Index(['codeeUserId'])
export class SlackUserMapping {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar", nullable: true })
    slackTeamId!: string;

    @Column({ type: "varchar", nullable: true })
    slackUserId!: string;

    @Column({ type: "varchar", nullable: true })
    codeeUserId!: string;

    @CreateDateColumn()
    createdAt!: Date;
}
