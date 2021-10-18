import React, {
  useState,
  useImperativeHandle,
  useCallback,
  useMemo,
} from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useAnimatedGestureHandler,
  useSharedValue,
  withSpring,
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
} from "react-native-reanimated";
import {
  GestureEvent,
  PanGestureHandler,
  PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";

export const DEFAULT_ANIMATION_CONFIG: Animated.WithSpringConfig = {
  damping: 20,
  mass: 0.2,
  stiffness: 100,
  overshootClamping: false,
  restSpeedThreshold: 0.2,
  restDisplacementThreshold: 0.2,
};

type PageComponentType = (props: {
  index: number;
  focusAnim: Animated.DerivedValue<number>;
}) => JSX.Element | null;

type Props = {
  PageComponent:
    | PageComponentType
    | React.MemoExoticComponent<PageComponentType>;
  pageCallbackNode?: Animated.SharedValue<number>;
  onPageChange?: (page: number) => void;
  pageBuffer?: number; // number of pages to render on either side of active page
};

type ImperativeApiOptions = {
  animated?: boolean;
};

export type InfinitePagerImperativeApi = {
  setPage: (index: number, options: ImperativeApiOptions) => void;
  incrementPage: (options: ImperativeApiOptions) => void;
  decrementPage: (options: ImperativeApiOptions) => void;
};

function InfinitePager(
  { PageComponent, pageCallbackNode, onPageChange, pageBuffer = 1 }: Props,
  ref: React.ForwardedRef<InfinitePagerImperativeApi>
) {
  const pageWidth = useSharedValue(0);
  const translateX = useSharedValue(0);
  const [curIndex, setCurIndex] = useState(0);
  const pageAnimInternal = useSharedValue(0);
  const pageAnim = pageCallbackNode || pageAnimInternal;

  const setPage = useCallback(
    (index: number, options: ImperativeApiOptions = {}) => {
      const updatedTranslateX = index * pageWidth.value * -1;
      if (options.animated) {
        translateX.value = withSpring(
          updatedTranslateX,
          DEFAULT_ANIMATION_CONFIG
        );
      } else {
        translateX.value = updatedTranslateX;
      }
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      setPage,
      incrementPage: (options?: ImperativeApiOptions) => {
        setPage(curIndex + 1, options);
      },
      decrementPage: (options?: ImperativeApiOptions) => {
        setPage(curIndex - 1, options);
      },
    }),
    [setPage]
  );

  const pageIndices = [...Array(pageBuffer * 2 + 1)].map((_, i) => {
    const bufferIndex = i - pageBuffer;
    return curIndex - bufferIndex;
  });

  useDerivedValue(() => {
    if (pageWidth.value) {
      pageAnim.value = (translateX.value / pageWidth.value) * -1;
    }
  }, [pageAnim, translateX]);

  function onPageChangeInternal(pg: number) {
    onPageChange?.(pg);
    setCurIndex(pg);
  }

  useAnimatedReaction(
    () => {
      return Math.round(pageAnim.value);
    },
    (cur, prev) => {
      if (cur !== prev) {
        runOnJS(onPageChangeInternal)(cur);
      }
    },
    []
  );

  const gestureHandler = useAnimatedGestureHandler<
    GestureEvent<PanGestureHandlerEventPayload>,
    { startX: number }
  >(
    {
      onStart: (_, ctx) => {
        ctx.startX = translateX.value;
      },
      onActive: (event, ctx) => {
        translateX.value = ctx.startX + event.translationX;
      },
      onEnd: (evt) => {
        const isFling = Math.abs(evt.velocityX) > 500;
        let velocityModifier = isFling ? pageWidth.value / 2 : 0;
        if (evt.velocityX < 0) velocityModifier *= -1;
        const page = Math.round(
          (translateX.value + velocityModifier) / pageWidth.value
        );
        translateX.value = withSpring(
          page * pageWidth.value,
          DEFAULT_ANIMATION_CONFIG
        );
      },
    },
    []
  );

  return (
    <Animated.View>
      <PanGestureHandler onGestureEvent={gestureHandler}>
        <Animated.View
          onLayout={({ nativeEvent }) =>
            (pageWidth.value = nativeEvent.layout.width)
          }
        >
          {pageIndices.map((pageIndex) => {
            return (
              <PageWrapper
                key={`page-provider-wrapper-${pageIndex}`}
                pageAnim={pageAnim}
                index={pageIndex}
                pageWidth={pageWidth}
              >
                {({ index, focusAnim, style }) => {
                  return (
                    <>
                      <Animated.View style={style}>
                        <PageComponent
                          key={`page-${pageIndex}`}
                          index={index}
                          focusAnim={focusAnim}
                        />
                      </Animated.View>
                      {index === curIndex && (
                        <View
                          style={{ transform: [{ translateX: 100000 }] }}
                          pointerEvents="none"
                        >
                          <PageComponent
                            key={`page-${pageIndex}`}
                            index={index}
                            focusAnim={focusAnim}
                          />
                        </View>
                      )}
                    </>
                  );
                }}
              </PageWrapper>
            );
          })}
        </Animated.View>
      </PanGestureHandler>
    </Animated.View>
  );
}

type PageContextType = {
  style: ReturnType<typeof useAnimatedStyle>;
  index: number;
  focusAnim: Animated.DerivedValue<number>;
};

type PageWrapperProps = {
  pageAnim: Animated.SharedValue<number>;
  index: number;
  pageWidth: Animated.SharedValue<number>;
  children: (renderProps: PageContextType) => React.ReactChild;
};

const PageContext = React.createContext<PageContextType | undefined>(undefined);

const PageWrapper = React.memo(
  ({ index, pageAnim, pageWidth, children }: PageWrapperProps) => {
    const translation = useDerivedValue(() => {
      const translateX = (index - pageAnim.value) * pageWidth.value;
      return translateX;
    }, []);

    const focusAnim = useDerivedValue(() => {
      const zeroFocused = Math.abs(translation.value) / pageWidth.value;
      const oneFocused = (zeroFocused - 1) * -1;
      return oneFocused;
    }, []);

    const style = useAnimatedStyle(() => {
      const isActivePage = Math.round(pageAnim.value);
      const hasInitialized = pageWidth.value > 0;
      const opacity = hasInitialized || isActivePage ? 1 : 0;
      return {
        opacity,
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        transform: [{ translateX: translation.value }],
      };
    }, []);

    const value = useMemo(
      () => ({ style, index, focusAnim }),
      [style, index, focusAnim]
    );

    return (
      <PageContext.Provider value={value}>
        {children(value)}
      </PageContext.Provider>
    );
  }
);

export default React.memo(React.forwardRef(InfinitePager));
