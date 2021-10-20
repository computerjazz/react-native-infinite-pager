import React, {
  useState,
  useImperativeHandle,
  useCallback,
  useRef,
} from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useAnimatedGestureHandler,
  useSharedValue,
  withSpring,
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
  interpolate,
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
  isActive: boolean;
  pageWidthAnim: Animated.SharedValue<number>;
  pageAnim: Animated.SharedValue<number>;
}) => JSX.Element | null;

type AnyStyle = StyleProp<ViewStyle> | ReturnType<typeof useAnimatedStyle>;

type Props = {
  PageComponent:
    | PageComponentType
    | React.MemoExoticComponent<PageComponentType>;
  pageCallbackNode?: Animated.SharedValue<number>;
  onPageChange?: (page: number) => void;
  pageBuffer?: number; // number of pages to render on either side of active page
  style?: AnyStyle;
  pageWrapperStyle?: AnyStyle;
  pageInterpolator?: typeof defaultPageInterpolator;
  minIndex?: number;
  maxIndex?: number;
  simultaneousHandlers?: React.Ref<unknown> | React.Ref<unknown>[];
  gesturesDisabled?: boolean;
  animationConfig?: Partial<Animated.WithSpringConfig>;
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
  {
    PageComponent,
    pageCallbackNode,
    onPageChange,
    pageBuffer = 1,
    style,
    pageWrapperStyle,
    pageInterpolator = defaultPageInterpolator,
    minIndex = -Infinity,
    maxIndex = Infinity,
    simultaneousHandlers,
    gesturesDisabled,
    animationConfig = {},
  }: Props,
  ref: React.ForwardedRef<InfinitePagerImperativeApi>
) {
  const pageWidth = useSharedValue(0);
  const translateX = useSharedValue(0);
  const [curIndex, setCurIndex] = useState(0);
  const pageAnimInternal = useSharedValue(0);
  const pageAnim = pageCallbackNode || pageAnimInternal;

  const pageInterpolatorRef = useRef(pageInterpolator);
  pageInterpolatorRef.current = pageInterpolator;

  const curIndexRef = useRef(curIndex);
  curIndexRef.current = curIndex;

  const animCfgRef = useRef(animationConfig);
  animCfgRef.current = animationConfig;

  const setPage = useCallback(
    (index: number, options: ImperativeApiOptions = {}) => {
      const updatedTranslateX = index * pageWidth.value * -1;
      if (options.animated) {
        const animCfg = {
          ...DEFAULT_ANIMATION_CONFIG,
          ...animCfgRef.current,
        };

        translateX.value = withSpring(updatedTranslateX, animCfg);
      } else {
        translateX.value = updatedTranslateX;
      }
    },
    [pageWidth, translateX]
  );

  useImperativeHandle(
    ref,
    () => ({
      setPage,
      incrementPage: (options?: ImperativeApiOptions) => {
        setPage(curIndexRef.current + 1, options);
      },
      decrementPage: (options?: ImperativeApiOptions) => {
        setPage(curIndexRef.current - 1, options);
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
        const rawVal = ctx.startX + event.translationX;
        const page = -rawVal / pageWidth.value;
        if (page >= minIndex && page <= maxIndex) {
          translateX.value = rawVal;
        }
      },
      onEnd: (evt) => {
        const isFling = Math.abs(evt.velocityX) > 500;
        let velocityModifier = isFling ? pageWidth.value / 2 : 0;
        if (evt.velocityX < 0) velocityModifier *= -1;
        let page =
          -1 *
          Math.round((translateX.value + velocityModifier) / pageWidth.value);
        if (page < minIndex) page = minIndex;
        if (page > maxIndex) page = maxIndex;

        const animCfg = Object.assign(
          {},
          DEFAULT_ANIMATION_CONFIG,
          animCfgRef.current
        );

        translateX.value = withSpring(-page * pageWidth.value, animCfg);
      },
    },
    [minIndex, maxIndex]
  );

  return (
    <PanGestureHandler
      enabled={!gesturesDisabled}
      onGestureEvent={gestureHandler}
      simultaneousHandlers={simultaneousHandlers}
    >
      <Animated.View
        style={style}
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
              isActive={pageIndex === curIndex}
              PageComponent={PageComponent}
              style={pageWrapperStyle}
              pageInterpolatorRef={pageInterpolatorRef}
            />
          );
        })}
      </Animated.View>
    </PanGestureHandler>
  );
}

type PageWrapperProps = {
  pageAnim: Animated.SharedValue<number>;
  index: number;
  pageWidth: Animated.SharedValue<number>;
  PageComponent: PageComponentType;
  isActive: boolean;
  style?: AnyStyle;
  pageInterpolatorRef: React.MutableRefObject<typeof defaultPageInterpolator>;
};

export type PageInterpolatorParams = {
  index: number;
  focusAnim: Animated.DerivedValue<number>;
  pageAnim: Animated.DerivedValue<number>;
  pageWidth: Animated.SharedValue<number>;
};

function defaultPageInterpolator({
  focusAnim,
  pageWidth,
}: PageInterpolatorParams): ReturnType<typeof useAnimatedStyle> {
  "worklet";
  return {
    transform: [
      {
        translateX: interpolate(
          focusAnim.value,
          [-1, 0, 1],
          [-pageWidth.value, 0, pageWidth.value]
        ),
      },
    ],
  };
}

const PageWrapper = React.memo(
  ({
    index,
    pageAnim,
    pageWidth,
    PageComponent,
    isActive,
    style,
    pageInterpolatorRef,
  }: PageWrapperProps) => {
    const translation = useDerivedValue(() => {
      const translateX = (index - pageAnim.value) * pageWidth.value;
      return translateX;
    }, []);

    const focusAnim = useDerivedValue(() => {
      if (!pageWidth.value) return 99999;
      return translation.value / pageWidth.value;
    }, []);

    const animStyle = useAnimatedStyle(() => {
      return pageInterpolatorRef.current({
        focusAnim,
        pageAnim,
        pageWidth,
        index,
      });
    }, [pageWidth, pageAnim, index, translation]);

    return (
      <Animated.View
        style={[
          style,
          styles.pageWrapper,
          animStyle,
          isActive && styles.activePage,
        ]}
      >
        <PageComponent
          index={index}
          isActive={isActive}
          focusAnim={focusAnim}
          pageWidthAnim={pageWidth}
          pageAnim={pageAnim}
        />
      </Animated.View>
    );
  }
);

export default React.memo(React.forwardRef(InfinitePager));

const styles = StyleSheet.create({
  pageWrapper: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    position: "absolute",
  },
  activePage: {
    position: "relative",
  },
});
