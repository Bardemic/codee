import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, Index } from 'typeorm';
import type { Agent } from './Agent';

@Entity()
export class Workspace {
    @PrimaryGeneratedColumn()
    id!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ length: 200, default: 'Untitled' })
    name!: string;

    @Column()
    userId!: string;

    @Column()
    githubRepositoryName!: string;

    @Column({ nullable: true })
    workerId?: number;

    @Index()
    @Column({ default: 'main' })
    currentBranch!: string;

    @Column({ nullable: true })
    slackChannelId?: string;

    @Column({ nullable: true })
    slackMessageTs?: string;

    @OneToMany('Agent', 'workspace')
    providerAgents!: Agent[];
}
