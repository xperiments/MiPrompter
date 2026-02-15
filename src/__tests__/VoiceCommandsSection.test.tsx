import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VoiceCommandsSection from '../components/sidebar/VoiceCommandsSection';
import { VOICE_COMMANDS_KEY } from '../lib/keys';

describe('VoiceCommandsSection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates wake word and persists to localStorage and calls setVoiceCommands', async () => {
    const setVoiceCommands = vi.fn();
    render(
      <VoiceCommandsSection
        presenter={{}}
        handleToggle={() => () => {}}
        voiceCommands={{ wakeWord: '', requireWakeWord: false, retry: 'retry', restart: 'restart' }}
        setVoiceCommands={setVoiceCommands}
        speechLanguage="en-US"
      />,
    );

    // open the collapsible section
    const toggleBtn = screen.getByRole('button', { name: /Speech/ });
    fireEvent.click(toggleBtn);

    const input = await screen.findByPlaceholderText('e.g. Siri');
    fireEvent.change(input, { target: { value: 'Alexa' } });

    await waitFor(() => {
      expect(setVoiceCommands).toHaveBeenCalled();
    });

    const stored = localStorage.getItem(VOICE_COMMANDS_KEY);
    expect(stored).toBeTruthy();
    const obj = JSON.parse(stored as string);
    expect(obj.wakeWord).toBe('Alexa');
  });

  it('calls checkSpeechOnDevice and shows status', async () => {
    const check = vi.fn().mockResolvedValue('available');
    render(
      <VoiceCommandsSection
        presenter={{}}
        handleToggle={() => () => {}}
        voiceCommands={{ wakeWord: '', requireWakeWord: false, retry: 'retry', restart: 'restart' }}
        setVoiceCommands={() => {}}
        speechLanguage="en-US"
        checkSpeechOnDevice={check}
      />,
    );

    // open the collapsible section
    const toggleBtn = screen.getByRole('button', { name: /Speech/ });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(check).toHaveBeenCalled();
    });

    expect(screen.getByText('Permission:', { exact: false })).toBeInTheDocument();
  });
});
