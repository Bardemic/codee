import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

@Entity()
@Unique(['slackTeamId', 'slackUserId'])
@Index(['codeeUserId'])
export class SlackUserMapping {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar" })
    slackTeamId!: string;

    @Column({ type: "varchar" })
    slackUserId!: string;

    @Column({ type: "varchar" })
    codeeUserId!: string;

    @CreateDateColumn()
    createdAt!: Date;
}
