import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index, OneToMany } from 'typeorm';
import type { Workspace } from './Workspace';
import type { Message } from './Message';

export enum AgentStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export enum ProviderType {
    CODEE = 'Codee',
    CURSOR = 'Cursor',
    JULES = 'Jules',
}

@Entity()
export class Agent {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne('Workspace', 'providerAgents', {
        onDelete: 'CASCADE',
    })
    workspace!: Workspace;

    @Index()
    @Column({ type: 'varchar', length: 20, default: AgentStatus.PENDING })
    status!: AgentStatus;

    @Column({ type: 'varchar', length: 10 })
    providerType!: ProviderType;

    @Column({ length: 200 })
    conversationId!: string;

    @Column()
    url!: string;

    @Column({ nullable: true })
    githubBranchName!: string | null;

    @Column({ length: 200, default: 'Untitled' })
    name!: string;

    @Column({ length: 200, nullable: true })
    model!: string | null;

    @Column({ nullable: true })
    sandboxId!: string | null;

    @OneToMany('Message', 'agent')
    messages!: Message[];
}
