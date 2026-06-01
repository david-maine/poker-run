import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  ImageBackground,
  StyleSheet,
  View,
} from "react-native";

type LoadingScreenProps = {
  accessibilityLabel?: string;
};

export default function LoadingScreen({
  accessibilityLabel = "Loading",
}: LoadingScreenProps) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <ImageBackground
      source={require("../../assets/images/loading-background.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.content}>
        <Animated.Image
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          source={require("../../assets/images/loading-icon.png")}
          style={[styles.icon, { transform: [{ rotate }] }]}
          resizeMode="contain"
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    height: 96,
    width: 96,
  },
});
