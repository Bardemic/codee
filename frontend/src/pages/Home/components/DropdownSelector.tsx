import { useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { BsChevronDown, BsChevronRight, BsCheck } from "react-icons/bs";
import styles from "../home.module.css";
import type { CSSProperties } from "react";

export type DropdownOption = {
    id: string;
    label: string;
    value?: string;
    children?: DropdownOption[];
};

interface DropdownSelectorProps {
    icon?: ReactNode;
    options: DropdownOption[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    label: string;
    dropdownVariant?: "attached" | "floating";
}

export function DropdownSelector({
    icon,
    options,
    selectedValues,
    onChange,
    label,
    dropdownVariant = "attached",
}: DropdownSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedIntegrations, setExpandedIntegrations] = useState<string[]>([]);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    useEffect(() => {
        if (dropdownVariant === "floating" && isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownPosition({ top: rect.bottom + 8, left: rect.left });
        }
    }, [dropdownVariant, isOpen]);

    const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
    const panelClassName = dropdownVariant === "floating" ? styles.toolsDropdown : styles.dropdownContainer;
    const panelStyle: CSSProperties | undefined = dropdownVariant === "floating" && dropdownPosition
        ? { top: dropdownPosition.top, left: dropdownPosition.left }
        : undefined;

    const collectValues = (option: DropdownOption): string[] => {
        const values: string[] = [];
        if (option.value) values.push(option.value);
        option.children?.forEach((child) => {
            values.push(...collectValues(child));
        });
        return values;
    };

    const toggleValues = (valuesToToggle: string[]) => {
        const currentSet = new Set(selectedValues);
        const hasAll = valuesToToggle.every((value) => currentSet.has(value));
        const toggleSet = new Set(valuesToToggle);
        if (hasAll) {
            onChange(selectedValues.filter((value) => !toggleSet.has(value)));
        } else {
            const additions = valuesToToggle.filter((value) => !currentSet.has(value));
            onChange([...selectedValues, ...additions]);
        }
    };

    const toggleValue = (value: string) => {
        onChange(selectedSet.has(value) 
            ? selectedValues.filter((item) => item !== value)
            : [...selectedValues, value]
        );
    };

    const toggleExpand = (id: string, event: ReactMouseEvent) => {
        event.stopPropagation();
        setExpandedIntegrations((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
    };

    const renderOption = (option: DropdownOption, depth = 0) => {
        const hasChildren = (option.children?.length ?? 0) > 0;
        const descendantValues = collectValues(option);
        const selectedCount = descendantValues.filter((value) => selectedSet.has(value)).length;
        const isAllSelected = descendantValues.length > 0 && selectedCount === descendantValues.length;
        const isPartial = selectedCount > 0 && !isAllSelected;
        const isLeafSelected = option.value ? selectedSet.has(option.value) : false;
        const isExpanded = expandedIntegrations.includes(option.id);

        if (!hasChildren) {
            const className = depth > 0 ? styles.toolItem : styles.dropdownOption;
            return (
                <div
                    key={option.id}
                    className={className}
                    role="option"
                    aria-selected={isLeafSelected}
                    onClick={(event) => {
                        event.stopPropagation();
                        if (option.value) toggleValue(option.value);
                    }}
                >
                    <div className={`${styles.checkbox} ${isLeafSelected ? styles.checked : ""}`}>
                        {isLeafSelected && <BsCheck size={12} />}
                    </div>
                    {option.label}
                </div>
            );
        }

        return (
            <div key={option.id} className={styles.integrationItem}>
                <div className={styles.integrationHeader} onClick={(event) => toggleExpand(option.id, event)}>
                    <div className={styles.integrationName}>
                        <div
                            className={`${styles.checkbox} ${isAllSelected || isPartial ? styles.checked : ""}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (descendantValues.length > 0) toggleValues(descendantValues);
                            }}
                        >
                            {(isAllSelected || isPartial) && <BsCheck size={12} />}
                        </div>
                        {option.label}
                    </div>
                    <div className={styles.expandIcon}>
                        {isExpanded ? <BsChevronDown /> : <BsChevronRight />}
                    </div>
                </div>
                {isExpanded && option.children && (
                    <div className={styles.toolList}>
                        {option.children.map((child) => renderOption(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    const dropdownContent = isOpen && options.length > 0 && (
        <div
            ref={dropdownRef}
            className={panelClassName}
            style={panelStyle}
            role="listbox"
            onClick={(event) => event.stopPropagation()}
        >
            {options.map((option) => renderOption(option))}
        </div>
    );

    return (
        <div
            ref={containerRef}
            className={styles.pillContainer}
            onClick={() => setIsOpen((prev) => !prev)}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
        >
            {icon}
            {label}
            <BsChevronDown size={12} />
            {dropdownContent}
        </div>
    );
}
