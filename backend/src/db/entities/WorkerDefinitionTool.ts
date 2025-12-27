import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import type { WorkerDefinition } from './WorkerDefinition';
import type { Tool } from './Tool';

@Entity()
export class WorkerDefinitionTool {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne('WorkerDefinition', 'tools', {
        onDelete: 'CASCADE',
    })
    workerDefinition!: WorkerDefinition;

    @ManyToOne('Tool', 'workerDefinitionTools', {
        onDelete: 'CASCADE',
    })
    tool!: Tool;

    @CreateDateColumn()
    createdAt!: Date;
}
