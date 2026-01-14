import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne, Index } from 'typeorm';
import type { Agent } from './Agent';
import type { Organization } from './Organization';

@Entity()
export class Workspace {
    @PrimaryGeneratedColumn()
    id!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ length: 200, default: 'Untitled' })
    name!: string;

    @Column()
    organizationId!: number;

    @ManyToOne('Organization', {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

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
