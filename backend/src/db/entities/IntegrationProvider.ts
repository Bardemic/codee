import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, OneToMany } from 'typeorm';
import type { Tool } from './Tool';
import type { IntegrationConnection } from './IntegrationConnection';

@Entity()
@Unique(['slug'])
export class IntegrationProvider {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar" })
    slug!: string;

    @Column({ type: "varchar" })
    displayName!: string;

    @Column({ type: 'boolean', default: false })
    hasCloudAgent!: boolean;

    @Column({ type: 'json', default: '{}' })
    schema!: Record<string, unknown>;

    @CreateDateColumn()
    createdAt!: Date;

    @OneToMany('Tool', 'provider')
    tools!: Tool[];

    @OneToMany('IntegrationConnection', 'provider')
    connections!: IntegrationConnection[];
}
