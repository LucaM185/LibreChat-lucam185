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
  getDocxPageCount: jest.fn().mockResolvedValue(0),
  isSpreadsheetFile: jest.fn().mockReturnValue(false),
  isWordDocument: jest.fn().mockReturnValue(false),
}));

const mockShowToast = jest.fn();

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
    useToastContext: () => ({ showToast: mockShowToast }),
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
const mockUtils = jest.requireMock('~/utils');

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function setupMocks(overrides: { provider?: string } = {}) {
  const translations: Record<string, string> = {
    com_files_upload_local_machine: 'From Local Computer',
    com_files_upload_sharepoint: 'From SharePoint',
    com_sidepanel_attach_files: 'Attach Files',
    com_error_docx_parse:
      'Could not determine the page count for this document. For best results, please convert it to PDF before uploading.',
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
  mockUtils.getPdfPageCount.mockResolvedValue(0);
  mockUtils.getDocxPageCount.mockResolvedValue(0);
  mockUtils.isSpreadsheetFile.mockReturnValue(false);
  mockUtils.isWordDocument.mockReturnValue(false);
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

async function fireFileChange(mimeType: string, filename: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (!input) return;
  const file = new File(['data'], filename, { type: mimeType });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return file;
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

  describe('Auto-routing: PDF', () => {
    it('routes a PDF with > 12 pages to file_search when capability is enabled', async () => {
      setupMocks();
      mockUtils.getPdfPageCount.mockResolvedValue(15);
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

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange('application/pdf', 'large.pdf');
      expect(mockHandleFiles).toHaveBeenCalledWith([file], 'file_search');
    });

    it('routes a PDF with <= 12 pages to provider (no toolResource)', async () => {
      setupMocks();
      mockUtils.getPdfPageCount.mockResolvedValue(5);
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

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange('application/pdf', 'small.pdf');
      expect(mockHandleFiles).toHaveBeenCalledWith([file], undefined);
    });
  });

  describe('Auto-routing: spreadsheet → execute_code', () => {
    it('routes a spreadsheet to execute_code when code capability is enabled', async () => {
      setupMocks();
      mockUtils.isSpreadsheetFile.mockReturnValue(true);
      const mockHandleFiles = jest.fn().mockResolvedValue(undefined);
      mockUseFileHandlingNoChatContext.mockReturnValue({
        handleFileChange: jest.fn(),
        handleFiles: mockHandleFiles,
      });
      mockUseAgentCapabilities.mockReturnValue({
        contextEnabled: false,
        fileSearchEnabled: false,
        codeEnabled: true,
      });
      mockUseAgentToolPermissions.mockReturnValue({
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: true,
        provider: undefined,
      });

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange('text/csv', 'data.csv');
      expect(mockHandleFiles).toHaveBeenCalledWith([file], 'execute_code');
    });

    it('routes a spreadsheet to provider when code capability is disabled', async () => {
      setupMocks();
      mockUtils.isSpreadsheetFile.mockReturnValue(true);
      const mockHandleFiles = jest.fn().mockResolvedValue(undefined);
      mockUseFileHandlingNoChatContext.mockReturnValue({
        handleFileChange: jest.fn(),
        handleFiles: mockHandleFiles,
      });

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange('text/csv', 'data.csv');
      expect(mockHandleFiles).toHaveBeenCalledWith([file], undefined);
    });
  });

  describe('Auto-routing: DOCX/word documents', () => {
    it('routes a DOCX with > 12 pages to file_search when capability is enabled', async () => {
      setupMocks();
      mockUtils.isWordDocument.mockReturnValue(true);
      mockUtils.getDocxPageCount.mockResolvedValue(20);
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

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'report.docx',
      );
      expect(mockHandleFiles).toHaveBeenCalledWith([file], 'file_search');
    });

    it('routes a DOCX with <= 12 pages to provider', async () => {
      setupMocks();
      mockUtils.isWordDocument.mockReturnValue(true);
      mockUtils.getDocxPageCount.mockResolvedValue(8);
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

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'short.docx',
      );
      expect(mockHandleFiles).toHaveBeenCalledWith([file], undefined);
    });

    it('shows a warning toast and routes to provider when DOCX page count cannot be parsed', async () => {
      setupMocks();
      mockUtils.isWordDocument.mockReturnValue(true);
      mockUtils.getDocxPageCount.mockResolvedValue(0);
      const mockHandleFiles = jest.fn().mockResolvedValue(undefined);
      mockUseFileHandlingNoChatContext.mockReturnValue({
        handleFileChange: jest.fn(),
        handleFiles: mockHandleFiles,
      });

      renderMenu({ endpointType: 'openAI' });
      const file = await fireFileChange(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'unknown.docx',
      );
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'warning',
          message:
            'Could not determine the page count for this document. For best results, please convert it to PDF before uploading.',
        }),
      );
      expect(mockHandleFiles).toHaveBeenCalledWith([file], undefined);
    });
  });

  describe('Edge Cases', () => {
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
