import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserProfileHeader from '../../components/social/UserProfileHeader';
import FriendListItem from '../../components/social/FriendListItem';
import JamInviteList from '../../components/social/JamInviteList';
import FriendRequestList from '../../components/social/FriendRequestList';
import AudioModeToggle from '../../components/social/AudioModeToggle';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optionsOrFallback?: any) => {
      if (typeof optionsOrFallback === 'string') return optionsOrFallback;
      if (optionsOrFallback && typeof optionsOrFallback === 'object') {
        return `${key} ${optionsOrFallback.name || ''}`.trim();
      }
      return key;
    },
  }),
}));

describe('Social Module Decomposition Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UserProfileHeader', () => {
    it('renders currentNick, displayTag, and handles copy click', () => {
      const handleCopy = vi.fn();
      render(
        <UserProfileHeader
          currentNick="Tester"
          displayTag="Tester#1234"
          isTagCopied={false}
          onCopyTag={handleCopy}
          variant="view"
        />
      );

      expect(screen.getByText('Tester#1234')).toBeDefined();
      expect(screen.getByText('T')).toBeDefined();
      const copyBtn = screen.getByRole('button');
      fireEvent.click(copyBtn);
      expect(handleCopy).toHaveBeenCalledTimes(1);
    });

    it('renders sidebar compact variant', () => {
      render(
        <UserProfileHeader
          currentNick="CompactUser"
          displayTag="CompactUser#9999"
          isTagCopied={true}
          onCopyTag={vi.fn()}
          variant="sidebar"
        />
      );

      expect(screen.getByText('CompactUser#9999')).toBeDefined();
      expect(screen.getByText('C')).toBeDefined();
    });
  });

  describe('FriendListItem', () => {
    const friend = {
      user_id: 'friend-1',
      username: 'Alice',
      tag: '0420',
      isOnline: true,
      nowPlaying: { title: 'Cosmic Dance', artist: 'Starlight' },
    };

    it('renders friend info, online status, now playing and jam invite button', () => {
      const handleInvite = vi.fn();
      render(
        <FriendListItem
          friend={friend}
          isInJam={false}
          canInviteToJam={true}
          onInviteToJam={handleInvite}
          variant="view"
        />
      );

      expect(screen.getByText('Alice')).toBeDefined();
      expect(screen.getByText('#0420')).toBeDefined();
      expect(screen.getByText(/Cosmic Dance/)).toBeDefined();
      const inviteBtn = screen.getByRole('button');
      fireEvent.click(inviteBtn);
      expect(handleInvite).toHaveBeenCalledTimes(1);
    });

    it('hides invite button when friend is already in Jam', () => {
      render(
        <FriendListItem
          friend={friend}
          isInJam={true}
          canInviteToJam={true}
          onInviteToJam={vi.fn()}
          variant="view"
        />
      );

      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('JamInviteList', () => {
    const invites = [
      {
        roomId: 'room-101',
        fromUser: 'Bob',
        fromTag: '1111',
        track: { title: 'Synthwave Dreams' },
      },
    ];

    it('renders invite card and accepts / declines', () => {
      const handleAccept = vi.fn();
      const handleDecline = vi.fn();

      render(
        <JamInviteList
          activeInvites={invites}
          onAccept={handleAccept}
          onDecline={handleDecline}
          variant="view"
        />
      );

      expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
      expect(screen.getByText('Synthwave Dreams')).toBeDefined();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2);

      fireEvent.click(buttons[0]);
      expect(handleAccept).toHaveBeenCalledWith('room-101');

      fireEvent.click(buttons[1]);
      expect(handleDecline).toHaveBeenCalledWith('room-101');
    });
  });

  describe('FriendRequestList', () => {
    const incoming = [
      { fromUserId: 'u-1', fromUsername: 'Charlie', fromTag: '2222' },
    ];
    const outgoing = [
      { toUserId: 'u-2', toUsername: 'David', toTag: '3333' },
    ];

    it('renders incoming requests with action buttons and outgoing requests', () => {
      const handleAccept = vi.fn();
      const handleDecline = vi.fn();

      render(
        <FriendRequestList
          incomingRequests={incoming}
          outgoingRequests={outgoing}
          onAccept={handleAccept}
          onDecline={handleDecline}
          variant="view"
        />
      );

      expect(screen.getByText('Charlie')).toBeDefined();
      expect(screen.getByText('#2222')).toBeDefined();
      expect(screen.getByText('David')).toBeDefined();
      expect(screen.getByText('#3333')).toBeDefined();

      const acceptBtn = screen.getByRole('button', { name: /accept|принять/i });
      fireEvent.click(acceptBtn);
      expect(handleAccept).toHaveBeenCalledWith('u-1');
    });
  });

  describe('AudioModeToggle', () => {
    it('handles changing audio mode', () => {
      const handleSetMode = vi.fn();
      const { rerender } = render(
        <AudioModeToggle
          audioMode="speaker_dj"
          onSetAudioMode={handleSetMode}
          variant="view"
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2);

      fireEvent.click(buttons[1]);
      expect(handleSetMode).toHaveBeenCalledWith('synced_audio');

      rerender(
        <AudioModeToggle
          audioMode="synced_audio"
          onSetAudioMode={handleSetMode}
          variant="sidebar"
        />
      );

      const sidebarButtons = screen.getAllByRole('button');
      fireEvent.click(sidebarButtons[0]);
      expect(handleSetMode).toHaveBeenCalledWith('speaker_dj');
    });
  });
});
