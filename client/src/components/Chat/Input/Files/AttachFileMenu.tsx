import React, { useRef, useState, useMemo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import {
  Providers,
  EToolResources,
  EModelEndpoint,
  isPermissiveMimeConfig,
  defaultAgentCapabilities,
  bedrockDocumentExtensions,
} from 'librechat-data-provider';
import {
  FileUpload,
  TooltipAnchor,
  DropdownPopup,
  AttachmentIcon,
  SharePointIcon,
} from '@librechat/client';
import * as Ariakit from '@ariakit/react';
import type { EndpointFileConfig, TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import {
  useAgentToolPermissions,
  useAgentCapabilities,
  useGetAgentsConfig,
  useFileHandlingNoChatContext,
  useLocalize,
} from '~/hooks';
import { useSharePointFileHandlingNoChatContext } from '~/hooks/Files/useSharePointFileHandling';
import { SharePointPickerDialog } from '~/components/SharePoint';
import { useGetStartupConfig } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import { cn, getPdfPageCount } from '~/utils';

const PDF_PAGE_THRESHOLD = 12;

interface AttachFileMenuProps {
  agentId?: string | null;
  endpoint?: string | null;
  disabled?: boolean | null;
  conversationId: string;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  conversation: TConversation | null;
}

const AttachFileMenu = ({
  agentId,
  endpoint,
  disabled,
  endpointType,
  conversationId,
  endpointFileConfig,
  useResponsesApi,
  files,
  setFiles,
  setFilesLoading,
  conversation,
}: AttachFileMenuProps) => {
  const localize = useLocalize();
  const isUploadDisabled = disabled ?? false;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(
    ephemeralAgentByConvoId(conversationId),
  );
  const { handleFiles } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });
  const { handleSharePointFiles, isProcessing, downloadProgress } =
    useSharePointFileHandlingNoChatContext(
      { toolResource: undefined },
      { files, setFiles, setFilesLoading, conversation },
    );

  const { agentsConfig } = useGetAgentsConfig();
  const { data: startupConfig } = useGetStartupConfig();
  const sharePointEnabled = startupConfig?.sharePointFilePickerEnabled;

  const [isSharePointDialogOpen, setIsSharePointDialogOpen] = useState(false);

  const capabilities = useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const { fileSearchAllowedByAgent, provider } = useAgentToolPermissions(agentId, ephemeralAgent);

  /** Compute the accept string once, based on the current endpoint/provider */
  const acceptTypes = useMemo(() => {
    if (isPermissiveMimeConfig(endpointFileConfig?.supportedMimeTypes)) {
      return '';
    }
    let currentProvider = provider || endpoint;
    if (currentProvider?.toLowerCase() === Providers.OPENROUTER) {
      currentProvider = Providers.OPENROUTER;
    }
    if (
      currentProvider === Providers.BEDROCK ||
      endpointType === EModelEndpoint.bedrock
    ) {
      return `image/*,.heif,.heic,${bedrockDocumentExtensions}`;
    }
    if (
      currentProvider === Providers.GOOGLE ||
      currentProvider === Providers.OPENROUTER
    ) {
      return 'image/*,.heif,.heic,.pdf,application/pdf,video/*,audio/*';
    }
    return 'image/*,.heif,.heic,.pdf,application/pdf';
  }, [provider, endpoint, endpointType, endpointFileConfig?.supportedMimeTypes]);

  /** Determine the appropriate tool resource for a file and handle uploading it */
  const handleAutoFileRoute = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (!event.target.files || event.target.files.length === 0) {
        return;
      }
      setFilesLoading(true);
      const fileList = Array.from(event.target.files);
      event.target.value = '';

      const canUseFileSearch = capabilities.fileSearchEnabled && fileSearchAllowedByAgent;

      for (const file of fileList) {
        let toolRes: EToolResources | undefined;

        const isPdf =
          file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        if (isPdf && canUseFileSearch) {
          const pageCount = await getPdfPageCount(file);
          if (pageCount > PDF_PAGE_THRESHOLD) {
            toolRes = EToolResources.file_search;
            setEphemeralAgent((prev) => ({ ...prev, [EToolResources.file_search]: true }));
          }
        }

        await handleFiles([file], toolRes);
      }
    },
    [
      capabilities.fileSearchEnabled,
      fileSearchAllowedByAgent,
      handleFiles,
      setEphemeralAgent,
      setFilesLoading,
    ],
  );

  const openFilePicker = useCallback(() => {
    if (!inputRef.current) {
      return;
    }
    inputRef.current.value = '';
    inputRef.current.accept = acceptTypes;
    inputRef.current.click();
    inputRef.current.accept = '';
  }, [acceptTypes]);

  const attachButton = (
    <TooltipAnchor
      render={
        <button
          type="button"
          disabled={isUploadDisabled}
          id="attach-file-menu-button"
          aria-label="Attach File Options"
          onClick={sharePointEnabled ? undefined : openFilePicker}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <AttachmentIcon />
          </div>
        </button>
      }
      id="attach-file-menu-button"
      description={localize('com_sidepanel_attach_files')}
      disabled={isUploadDisabled}
    />
  );

  const handleSharePointFilesSelected = async (sharePointFiles: any[]) => {
    try {
      await handleSharePointFiles(sharePointFiles);
      setIsSharePointDialogOpen(false);
    } catch (error) {
      console.error('SharePoint file processing error:', error);
    }
  };

  const sharePointDropdownItems = useMemo(
    () => [
      {
        label: localize('com_files_upload_local_machine'),
        onClick: openFilePicker,
        icon: <AttachmentIcon />,
      },
      {
        label: localize('com_files_upload_sharepoint'),
        onClick: () => setIsSharePointDialogOpen(true),
        icon: <SharePointIcon className="icon-md" />,
      },
    ],
    [localize, openFilePicker],
  );

  return (
    <>
      <FileUpload ref={inputRef} handleFileChange={handleAutoFileRoute}>
        {sharePointEnabled ? (
          <DropdownPopup
            menuId="attach-file-menu"
            className="overflow-visible"
            isOpen={isPopoverActive}
            setIsOpen={setIsPopoverActive}
            modal={true}
            unmountOnHide={true}
            trigger={
              <TooltipAnchor
                render={
                  <Ariakit.MenuButton
                    disabled={isUploadDisabled}
                    id="attach-file-menu-button"
                    aria-label="Attach File Options"
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
                      isPopoverActive && 'bg-surface-hover',
                    )}
                  >
                    <div className="flex w-full items-center justify-center gap-2">
                      <AttachmentIcon />
                    </div>
                  </Ariakit.MenuButton>
                }
                id="attach-file-menu-button"
                description={localize('com_sidepanel_attach_files')}
                disabled={isUploadDisabled}
              />
            }
            items={sharePointDropdownItems}
            iconClassName="mr-0"
          />
        ) : (
          attachButton
        )}
      </FileUpload>
      <SharePointPickerDialog
        isOpen={isSharePointDialogOpen}
        onOpenChange={setIsSharePointDialogOpen}
        onFilesSelected={handleSharePointFilesSelected}
        isDownloading={isProcessing}
        downloadProgress={downloadProgress}
        maxSelectionCount={endpointFileConfig?.fileLimit}
      />
    </>
  );
};

export default React.memo(AttachFileMenu);
