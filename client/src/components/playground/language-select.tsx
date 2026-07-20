import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

import {
    languages,
    type Language,
} from "../../lib/languages";

interface LanguageSelectProps {
    value: Language;
    onChange: (language: Language) => void;
    disabled?: boolean;
}

export function LanguageSelect({
    value,
    onChange,
    disabled = false,
}: LanguageSelectProps) {
    return (
        <Select.Root value={value}
            onValueChange={(nextValue) =>
                onChange(nextValue as Language)
            }
            disabled={disabled}
        >
            <Select.Trigger className="language-select-trigger" aria-label="Programming language">
                <Select.Value />

                <Select.Icon>
                    <ChevronDown size={14} />
                </Select.Icon>
            </Select.Trigger>

            <Select.Portal>
                <Select.Content className="language-select-content" position="popper" sideOffset={8} align="end">
                    <Select.Viewport className="language-select-viewport">
                        {languages.map((language) => (
                            <Select.Item key={language.value} value={language.value} className="language-select-item">
                                <div className="language-select-label">
                                    <span className={`language-dot language-${language.value}`} />

                                    <Select.ItemText>
                                        {language.label}
                                    </Select.ItemText>
                                </div>

                                <Select.ItemIndicator>
                                    <Check size={14} />
                                </Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Select.Viewport>
                </Select.Content>
            </Select.Portal>
        </Select.Root>
    );
}