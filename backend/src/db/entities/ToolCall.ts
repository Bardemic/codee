import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Index } from 'typeorm';
import type { Agent } from './Agent';
import type { Message } from './Message';

@Entity()
export class ToolCall {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne('Agent', { onDelete: 'CASCADE' })
    agent!: Agent;

    @ManyToOne('Message', 'toolCalls', { onDelete: 'CASCADE' })
    message!: Message;

    @CreateDateColumn()
    createdAt!: Date;

    @Index()
    @Column({ type: 'varchar',  length: 100 })
    toolName!: string;

    @Column({ type: 'jsonb', default: {} })
    arguments!: Record<string, unknown>;

    @Column({ type: 'varchar', default: '' })
    result!: string;

    @Column({ type: 'varchar',  length: 20, default: 'success' })
    status!: string;
}
