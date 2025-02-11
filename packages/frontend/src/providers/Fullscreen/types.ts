type FullscreenContextType =
    | undefined
    | {
          enabled: boolean;
          isFullscreen: boolean;
          toggleFullscreen: (nextValue?: boolean) => void;
      };

export default FullscreenContextType;
