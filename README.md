# React Native Infinite Pager

An infinitely-swipeable horizontal pager component.<br />
Fully native interactions powered by [Reanimated 2](https://github.com/kmagiera/react-native-reanimated) and [React Native Gesture Handler](https://github.com/kmagiera/react-native-gesture-handler)

![InfinitePager demo](https://i.imgur.com/5lIxuQX.gif)

## Install

1. Follow installation instructions for [reanimated](https://github.com/kmagiera/react-native-reanimated) and [react-native-gesture-handler](https://github.com/kmagiera/react-native-gesture-handler)
2. `npm install` or `yarn add` `react-native-infinite-pager`
3. `import InfinitePager from 'react-native-infinite-pager'`

### Props

```typescript
type PageProps = {
  index: number;
  focusAnim: Animated.DerivedValue<number>;
  isActive: boolean;
  pageWidthAnim: Animated.SharedValue<number>;
  pageAnim: Animated.SharedValue<number>;
}

type PageComponentType = (props: PageProps) => JSX.Element | null;

type AnyStyle = StyleProp<ViewStyle> | ReturnType<typeof useAnimatedStyle>;

type Props = {
  PageComponent?:
    | PageComponentType
    | React.MemoExoticComponent<PageComponentType>;
  renderPage?: PageComponentType
  pageCallbackNode?: Animated.SharedValue<number>;
  onPageChange?: (page: number) => void;
  pageBuffer?: number; 
  style?: AnyStyle;
  pageWrapperStyle?: AnyStyle;
  pageInterpolator?: typeof defaultPageInterpolator;
  minIndex?: number;
  maxIndex?: number;
  simultaneousGestures?: (ComposedGesture | GestureType)[];
  gesturesDisabled?: boolean;
  animationConfig?: Partial<WithSpringConfig>;
};
```

| Name               | Type                     | Description                                     |
| :----------------- | :----------------------- | :---------------------------------------------- |
| `PageComponent`    | `PageComponentType`      | Component to be rendered as each page (either PageComponent OR renderPage must be defined, but not both — choose the version that suits your use case).          |
| `renderPage`    | `PageComponentType`      | Function to be called to render each page.          |
| `onPageChange`     | `(page: number) => void` | Callback invoked when the current page changes. |
| `style`            | `AnyStyle`               | Style of the pager container.                   |
| `pageWrapperStyle` | `AnyStyle`               | Style of the container that wraps each page.    |
| `pageCallbackNode` | `Animated.SharedValue<number>`               | SharedValue that represents the index of the current page.    |
| `pageBuffer` | `number`               | Number of pages to render on either side of the active page.    |
| `pageInterpolator` | `(params: PageInterpolatorParams) => ReturnType<typeof useAnimatedStyle>`               | Interpolator for custom page animations.    |
| `minIndex`            | `number`               | Minimum page index for non-infinite behavior (optional).                   |
| `maxIndex`            | `number`               | Maximum page index for non-infinite behavior (optional).                   |
| `simultaneousGestures`            | `(ComposedGesture \| GestureType)[]`               | Simultaneous RNGH gestures.                   |
| `gesturesDisabled`            | `boolean`               | Disables pan gestures.                   |
| `animationConfig`            | `Partial<WithSpringConfig>`               | Customizes paging animations.                   |
| `vertical`            | `boolean`               | Sets page gesture to the vertical axis.                   |
| `flingVelocity`            | `number`               | Determines sensitivity of a page-turning "fling" at the end of the gesture.                   |




### Imperative Api

```typescript
type ImperativeApiOptions = {
  animated?: boolean;
};

export type InfinitePagerImperativeApi = {
  setPage: (index: number, options: ImperativeApiOptions) => void;
  incrementPage: (options: ImperativeApiOptions) => void;
  decrementPage: (options: ImperativeApiOptions) => void;
};
```

| Name            | Type                                                     | Description                |
| :-------------- | :------------------------------------------------------- | :------------------------- |
| `incrementPage` | `(options: ImperativeApiOptions) => void`                | Go to next page.           |
| `decrementPage` | `(options: ImperativeApiOptions) => void`                | Go to previous page.       |
| `setPage`       | `(index: number, options: ImperativeApiOptions) => void` | Go to page of given index. |

### Example

https://snack.expo.dev/@computerjazz/infinite-pager

```typescript
import React from "react";
import { Text, View, StyleSheet, TouchableOpacity } from "react-native";
import InfinitePager from "react-native-infinite-pager";

const NUM_ITEMS = 50;

function getColor(i: number) {
  const multiplier = 255 / (NUM_ITEMS - 1);
  const colorVal = Math.abs(i) * multiplier;
  return `rgb(${colorVal}, ${Math.abs(128 - colorVal)}, ${255 - colorVal})`;
}

const Page = ({ index }: { index: number }) => {
  return (
    <View
      style={[
        styles.flex,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: getColor(index),
        },
      ]}
    >
      <Text style={{ color: "white", fontSize: 80 }}>{index}</Text>
    </View>
  );
};

export default function App() {
  return (
    <View style={styles.flex}>
      <InfinitePager
        PageComponent={Page}
        style={styles.flex}
        pageWrapperStyle={styles.flex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
```
