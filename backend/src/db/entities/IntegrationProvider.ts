import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, OneToMany } from 'typeorm';
import type { Tool } from './Tool';
import type { IntegrationConnection } from './IntegrationConnection';

@Entity()
@Unique(['slug'])
export class IntegrationProvider {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    slug!: string;

    @Column()
    displayName!: string;

    @Column({ default: false })
    hasCloudAgent!: boolean;

    @Column({ type: 'jsonb', default: {} })
    schema!: Record<string, unknown>;

    @CreateDateColumn()
    createdAt!: Date;

    @OneToMany('Tool', 'provider')
    tools!: Tool[];

    @OneToMany('IntegrationConnection', 'provider')
    connections!: IntegrationConnection[];
}
