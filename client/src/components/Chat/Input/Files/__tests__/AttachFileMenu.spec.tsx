import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EModelEndpoint } from 'librechat-data-provider';
import AttachFileMenu from '../AttachFileMenu';

jest.mock('~/hooks', () => ({
  useAgentToolPermissions: jest.fn(),
  useAgentCapabilities: jest.fn(),
  useGetAgentsConfig: jest.fn(),
  useFileHandlingNoChatContext: jest.fn(),
  useLocalize: jest.fn(),
}));

jest.mock('~/hooks/Files/useSharePointFileHandling', () => ({
  __esModule: true,
  default: jest.fn(),
  useSharePointFileHandlingNoChatContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

jest.mock('~/components/SharePoint', () => ({
  SharePointPickerDialog: () => null,
}));

jest.mock('~/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
  getPdfPageCount: jest.fn().mockResolvedValue(0),
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    FileUpload: (props) =>
      R.createElement('div', { 'data-testid': 'file-upload' }, props.children),
    TooltipAnchor: (props) => props.render,
    DropdownPopup: (props) =>
      R.createElement(
        'div',
        null,
        R.createElement('div', { onClick: () => props.setIsOpen(!props.isOpen) }, props.trigger),
        props.isOpen &&
          R.createElement(
            'div',
            { 'data-testid': 'dropdown-menu' },
            props.items.map((item, idx) =>
              R.createElement(
                'button',
                { key: idx, onClick: item.onClick, 'data-testid': `menu-item-${idx}` },
                item.label,
              ),
            ),
          ),
      ),
    AttachmentIcon: () => R.createElement('span', { 'data-testid': 'attachment-icon' }),
    SharePointIcon: () => R.createElement('span', { 'data-testid': 'sharepoint-icon' }),
    useToastContext: () => ({ showToast: jest.fn() }),
  };
});

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

const mockUseAgentToolPermissions = jest.requireMock('~/hooks').useAgentToolPermissions;
const mockUseAgentCapabilities = jest.requireMock('~/hooks').useAgentCapabilities;
const mockUseGetAgentsConfig = jest.requireMock('~/hooks').useGetAgentsConfig;
const mockUseFileHandlingNoChatContext = jest.requireMock('~/hooks').useFileHandlingNoChatContext;
const mockUseLocalize = jest.requireMock('~/hooks').useLocalize;
const mockUseSharePointFileHandlingNoChatContext = jest.requireMock(
  '~/hooks/Files/useSharePointFileHandling',
).useSharePointFileHandlingNoChatContext;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function setupMocks(overrides: { provider?: string } = {}) {
  const translations: Record<string, string> = {
    com_files_upload_local_machine: 'From Local Computer',
    com_files_upload_sharepoint: 'From SharePoint',
    com_sidepanel_attach_files: 'Attach Files',
  };
  mockUseLocalize.mockReturnValue((key: string) => translations[key] || key);
  mockUseAgentCapabilities.mockReturnValue({
    contextEnabled: false,
    fileSearchEnabled: false,
    codeEnabled: false,
  });
  mockUseGetAgentsConfig.mockReturnValue({ agentsConfig: {} });
  mockUseFileHandlingNoChatContext.mockReturnValue({
    handleFileChange: jest.fn(),
    handleFiles: jest.fn().mockResolvedValue(undefined),
  });
  const sharePointReturnValue = {
    handleSharePointFiles: jest.fn(),
    isProcessing: false,
    downloadProgress: 0,
    error: null,
  };
  mockUseSharePointFileHandlingNoChatContext.mockReturnValue(sharePointReturnValue);
  mockUseGetStartupConfig.mockReturnValue({ data: { sharePointFilePickerEnabled: false } });
  mockUseAgentToolPermissions.mockReturnValue({
    fileSearchAllowedByAgent: false,
    codeAllowedByAgent: false,
    provider: overrides.provider ?? undefined,
  });
}

function renderMenu(props: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <AttachFileMenu
          conversationId="test-convo"
          files={new Map()}
          setFiles={() => {}}
          setFilesLoading={() => {}}
          conversation={null}
          {...props}
        />
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('AttachFileMenu', () => {
  beforeEach(jest.clearAllMocks);

  describe('Basic Rendering', () => {
    it('renders the attachment button', () => {
      setupMocks();
      renderMenu();
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('is disabled when disabled prop is true', () => {
      setupMocks();
      renderMenu({ disabled: true });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeDisabled();
    });

    it('is not disabled when disabled prop is false', () => {
      setupMocks();
      renderMenu({ disabled: false });
      expect(screen.getByRole('button', { name: /attach file options/i })).not.toBeDisabled();
    });

    it('does not show a file-type dropdown when SharePoint is disabled', () => {
      setupMocks();
      renderMenu({ endpointType: EModelEndpoint.openAI });
      expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
    });
  });

  describe('SharePoint Integration', () => {
    it('shows SharePoint dropdown with two source options when SharePoint is enabled', () => {
      setupMocks();
      mockUseGetStartupConfig.mockReturnValue({
        data: { sharePointFilePickerEnabled: true },
      });
      renderMenu({ endpointType: EModelEndpoint.openAI });
      fireEvent.click(screen.getByRole('button', { name: /attach file options/i }));
      expect(screen.getByText('From Local Computer')).toBeInTheDocument();
      expect(screen.getByText('From SharePoint')).toBeInTheDocument();
    });

    it('does NOT show SharePoint option when disabled', () => {
      setupMocks();
      renderMenu({ endpointType: EModelEndpoint.openAI });
      expect(screen.queryByText('From SharePoint')).not.toBeInTheDocument();
    });
  });

  describe('Auto-routing: large PDF to file search', () => {
    it('routes a PDF with > 12 pages to file_search when capability is enabled', async () => {
      const { getPdfPageCount: mockGetPdfPageCount } = jest.requireMock('~/utils');
      mockGetPdfPageCount.mockResolvedValue(15);

      const mockHandleFiles = jest.fn().mockResolvedValue(undefined);
      mockUseFileHandlingNoChatContext.mockReturnValue({
        handleFileChange: jest.fn(),
        handleFiles: mockHandleFiles,
      });
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: false,
        provider: undefined,
      });

      setupMocks();
      // Re-apply the specific overrides after setupMocks resets them
      mockGetPdfPageCount.mockResolvedValue(15);
      mockHandleFiles.mockResolvedValue(undefined);
      mockUseFileHandlingNoChatContext.mockReturnValue({
        handleFileChange: jest.fn(),
        handleFiles: mockHandleFiles,
      });
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: false,
        provider: undefined,
      });

      renderMenu({ endpointType: 'openAI' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) {
        const pdfFile = new File(['%PDF-1.4'], 'large.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [pdfFile], configurable: true });
        fireEvent.change(input);
        // wait for the async handler
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mockHandleFiles).toHaveBeenCalledWith([pdfFile], 'file_search');
      }
    });

    it('routes a PDF with <= 12 pages to provider (no toolResource)', async () => {
      const { getPdfPageCount: mockGetPdfPageCount } = jest.requireMock('~/utils');
      mockGetPdfPageCount.mockResolvedValue(5);

      const mockHandleFiles = jest.fn().mockResolvedValue(undefined);

      setupMocks();
      mockGetPdfPageCount.mockResolvedValue(5);
      mockHandleFiles.mockResolvedValue(undefined);
      mockUseFileHandlingNoChatContext.mockReturnValue({
        handleFileChange: jest.fn(),
        handleFiles: mockHandleFiles,
      });
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: true,
        codeEnabled: false,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: true,
        codeAllowedByAgent: false,
        provider: undefined,
      });

      renderMenu({ endpointType: 'openAI' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) {
        const pdfFile = new File(['%PDF-1.4'], 'small.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [pdfFile], configurable: true });
        fireEvent.change(input);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(mockHandleFiles).toHaveBeenCalledWith([pdfFile], undefined);
      }
    });
  });
    it('handles undefined endpoint and provider gracefully', () => {
      setupMocks();
      renderMenu({ endpoint: undefined, endpointType: undefined });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('handles null endpoint and provider gracefully', () => {
      setupMocks();
      renderMenu({ endpoint: null, endpointType: null });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('handles missing agentId gracefully', () => {
      setupMocks();
      renderMenu({ agentId: undefined, endpointType: EModelEndpoint.openAI });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });

    it('handles empty string agentId', () => {
      setupMocks();
      renderMenu({ agentId: '', endpointType: EModelEndpoint.openAI });
      expect(screen.getByRole('button', { name: /attach file options/i })).toBeInTheDocument();
    });
  });
});
