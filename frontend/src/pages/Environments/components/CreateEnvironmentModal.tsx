import { trpc } from '../../../lib/trpc';
import type { Repository } from '../../../lib/types';
import { useState, useEffect, useMemo, useRef } from 'react';
import { GoRepo } from 'react-icons/go';
import { FiPlus, FiX } from 'react-icons/fi';
import styles from './styles.module.css';

interface EnvFile {
    path: string;
    content: string;
}

interface CreateEnvironmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    environmentId?: number | null;
}

export function CreateEnvironmentModal({ isOpen, onClose, environmentId }: CreateEnvironmentModalProps) {
    const utils = trpc.useUtils();
    const createEnvironment = trpc.environments.create.useMutation({
        onSuccess: () => utils.environments.list.invalidate(),
    });
    const updateEnvironment = trpc.environments.update.useMutation({
        onSuccess: () => utils.environments.list.invalidate(),
    });
    const deleteEnvironment = trpc.environments.delete.useMutation({
        onSuccess: () => utils.environments.list.invalidate(),
    });

    const { data: environment } = trpc.environments.get.useQuery(
        { id: environmentId! },
        { enabled: isOpen && !!environmentId }
    );

    const { data: repos } = trpc.integrations.repositories.useQuery(undefined, {
        enabled: isOpen,
        trpc: { context: { skipBatch: true } },
    });

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedRepo, setSelectedRepo] = useState<string>('');
    const [files, setFiles] = useState<EnvFile[]>([{ path: '.env', content: '' }]);
    const [error, setError] = useState<string | null>(null);
    const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false);
    const [repoSearch, setRepoSearch] = useState('');
    const repoDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (environment) {
                setName(environment.name);
                setDescription(environment.description || '');
                setSelectedRepo(environment.github_repository_name);
                setFiles(
                    environment.files.map((f) => ({
                        path: f.path,
                        content: f.content,
                    }))
                );
            } else {
                setName('');
                setDescription('');
                setSelectedRepo('');
                setFiles([{ path: '.env', content: '' }]);
            }
        }
    }, [isOpen, environment]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (repoDropdownRef.current && !repoDropdownRef.current.contains(event.target as Node)) {
                setIsRepoDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredRepos = useMemo(() => {
        const query = repoSearch.trim().toLowerCase();
        return (repos ?? []).filter((repo) => !query || repo.name.toLowerCase().includes(query));
    }, [repos, repoSearch]);

    if (!isOpen) return null;

    const isLoading = createEnvironment.isPending || updateEnvironment.isPending || deleteEnvironment.isPending;

    const handleAddFile = () => {
        setFiles([...files, { path: '', content: '' }]);
    };

    const handleRemoveFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const handleFileChange = (index: number, field: 'path' | 'content', value: string) => {
        const newFiles = [...files];
        newFiles[index][field] = value;
        setFiles(newFiles);
    };

    const handleSubmit = async () => {
        setError(null);

        if (!name.trim()) {
            setError('Name is required');
            return;
        }
        if (!selectedRepo) {
            setError('Repository is required');
            return;
        }
        if (files.length === 0) {
            setError('At least one .env file is required');
            return;
        }
        const invalidFiles = files.filter((f) => !f.path.trim());
        if (invalidFiles.length > 0) {
            setError('All files must have a path');
            return;
        }

        try {
            const payload = {
                name: name.trim(),
                github_repository_name: selectedRepo,
                description: description.trim() || undefined,
                files: files.map((f) => ({
                    path: f.path.trim(),
                    content: f.content,
                })),
            };

            if (environment) {
                await updateEnvironment.mutateAsync({
                    id: environment.id,
                    ...payload,
                });
            } else {
                await createEnvironment.mutateAsync(payload);
            }
            onClose();
        } catch (err: unknown) {
            const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to save environment';
            setError(message);
        }
    };

    const handleDelete = async () => {
        if (!environment) return;
        setError(null);
        try {
            await deleteEnvironment.mutateAsync({ id: environment.id });
            onClose();
        } catch (err: unknown) {
            const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to delete environment';
            setError(message);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
                <h2>{environment ? 'Edit Environment' : 'Create Environment'}</h2>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Name</label>
                    <input
                        type="text"
                        className={styles.formInput}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Production, Staging, Development..."
                    />
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Repository</label>
                    <div className={styles.repoSelector} ref={repoDropdownRef}>
                        <button
                            type="button"
                            className={styles.repoSelectorButton}
                            onClick={() => setIsRepoDropdownOpen(!isRepoDropdownOpen)}
                        >
                            <GoRepo size={14} />
                            <span>{selectedRepo || 'Select repository...'}</span>
                        </button>
                        {isRepoDropdownOpen && (
                            <div className={styles.repoDropdown}>
                                <input
                                    type="text"
                                    className={styles.repoSearchInput}
                                    placeholder="Search repositories..."
                                    value={repoSearch}
                                    onChange={(e) => setRepoSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                {filteredRepos.map((repo) => (
                                    <div
                                        key={repo.github_id}
                                        className={`${styles.repoOption} ${repo.name === selectedRepo ? styles.repoOptionSelected : ''}`}
                                        onClick={() => {
                                            setSelectedRepo(repo.name);
                                            setIsRepoDropdownOpen(false);
                                        }}
                                    >
                                        <GoRepo size={14} />
                                        <span>{repo.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Description (optional)</label>
                    <textarea
                        className={styles.formTextarea}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Environment description..."
                    />
                </div>

                <div className={styles.filesSection}>
                    <div className={styles.filesSectionHeader}>
                        <label className={styles.formLabel}>Environment Files</label>
                        <button type="button" className={styles.addFileButton} onClick={handleAddFile}>
                            <FiPlus size={14} />
                            Add File
                        </button>
                    </div>

                    {files.length === 0 ? (
                        <div className={styles.emptyFiles}>No environment files. Click "Add File" to create one.</div>
                    ) : (
                        files.map((file, index) => (
                            <div key={index} className={styles.fileEntry}>
                                <div className={styles.fileHeader}>
                                    <input
                                        type="text"
                                        className={styles.filePathInput}
                                        value={file.path}
                                        onChange={(e) => handleFileChange(index, 'path', e.target.value)}
                                        placeholder="e.g., .env, frontend/.env, backend/.env"
                                    />
                                    {files.length > 1 && (
                                        <button
                                            type="button"
                                            className={styles.removeFileButton}
                                            onClick={() => handleRemoveFile(index)}
                                        >
                                            <FiX size={16} />
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    className={styles.fileContentTextarea}
                                    value={file.content}
                                    onChange={(e) => handleFileChange(index, 'content', e.target.value)}
                                    placeholder="KEY=value&#10;ANOTHER_KEY=another_value"
                                />
                            </div>
                        ))
                    )}
                </div>

                <div className={styles.modalActions}>
                    {environment && (
                        <button className={styles.deleteButton} onClick={handleDelete} disabled={isLoading}>
                            Delete
                        </button>
                    )}
                    {error && <span className={styles.errorMessage}>{error}</span>}
                    <div className={styles.buttonsBar} />
                    <button className={styles.cancelButton} onClick={onClose}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={isLoading}>
                        {environment ? 'Save' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}
