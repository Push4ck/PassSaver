import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
  BackHandler,
  Image,
} from "react-native";
import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Icon from "../components/Icon";
import { COLORS, FONTS, SPACING, SHADOWS } from "../constants/theme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useSession } from "../context/SessionContext";
import { loadVault, deleteEntry, toggleFavorite } from "../utils/storage";
import { PasswordEntry, Category } from "../types";
import PasswordGeneratorModal from "../components/PasswordGeneratorModal";
import { CATEGORY_ICONS, ACTION_ICONS } from "../utils/icons";
import {
  AnimatedListItem,
  AnimatedButton,
  FadeIn,
  ScaleIn,
} from "../components/AnimatedComponents";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteP = RouteProp<RootStackParamList, "Home">;

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteP>();
  const { masterPassword, secureCopy } = useSession();
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [favoriting, setFavoriting] = useState(new Set<string>());
  const [deleting, setDeleting] = useState(new Set<string>());
  const fetchInFlightRef = React.useRef<Promise<void> | null>(null);

  const fetchVault = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (fetchInFlightRef.current) {
        if (!opts?.silent) setRefreshing(true);
        try {
          await fetchInFlightRef.current;
        } finally {
          if (!opts?.silent) setRefreshing(false);
        }
        return;
      }

      const run = (async () => {
        if (__DEV__) {
          console.log("Home fetchVault called", {
            hasMasterPassword: Boolean(masterPassword),
          });
        }
        if (!masterPassword) {
          if (__DEV__) console.log("Skipping vault load: no session password");
          setEntries([]);
          setRefreshing(false);
          setInitialLoading(false);
          return;
        }
        if (!opts?.silent) setRefreshing(true);
        try {
          const data = await loadVault(masterPassword);
          if (__DEV__) {
            console.info("Vault loaded into Home screen", {
              count: data.length,
            });
          }
          setEntries(data);
        } finally {
          if (!opts?.silent) setRefreshing(false);
          setInitialLoading(false);
        }
      })();

      fetchInFlightRef.current = run;
      try {
        await run;
      } finally {
        fetchInFlightRef.current = null;
      }
    },
    [masterPassword],
  );

  useEffect(() => {
    fetchVault({ silent: true });
  }, [fetchVault]);

  // Reload vault data whenever screen is focused (e.g., after navigation back)
  useFocusEffect(
    useCallback(() => {
      if (__DEV__) console.log("HomeScreen focused, reloading vault");
      fetchVault({ silent: true });
    }, [fetchVault]),
  );

  useEffect(() => {
    const snapshot = route.params?.vaultSnapshot;
    if (!snapshot) return;
    setEntries(snapshot);
    setInitialLoading(false);
    navigation.setParams({ vaultSnapshot: undefined });
  }, [route.params?.vaultSnapshot, navigation]);

  useEffect(() => {
    const mutation = route.params?.vaultMutation;
    if (!mutation) return;
    setEntries((prev) => {
      if (mutation.type === "add") {
        return [mutation.entry, ...prev];
      }
      const exists = prev.some((e) => e.id === mutation.entry.id);
      if (!exists) return [mutation.entry, ...prev];
      return prev.map((e) => (e.id === mutation.entry.id ? mutation.entry : e));
    });
    navigation.setParams({ vaultMutation: undefined });
  }, [route.params?.vaultMutation, navigation]);

  useEffect(() => {
    if (__DEV__) console.info("HomeScreen mounted");

    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (navigation.canGoBack()) return false;
      BackHandler.exitApp();
      return true;
    });

    return () => {
      backSub.remove();
    };
  }, [navigation]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 120);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = q
      ? entries.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.username.toLowerCase().includes(q),
        )
      : entries;

    // Copy before sort to avoid mutating `entries`
    return [...list].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [entries, debouncedSearch]);

  const handleCopy = useCallback(
    async (password: string) => {
      try {
        await secureCopy(password);
      } catch (error) {
        if (__DEV__) {
          console.error("Copy error:", error);
        }
        Alert.alert("Error", "Failed to copy password");
      }
    },
    [secureCopy],
  );

  const handleDelete = useCallback(
    (id: string, title: string) => {
      console.log("Delete entry requested", { id, title });
      Alert.alert(
        "Delete Entry",
        `Are you sure you want to delete "${title}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setDeleting((prev) => new Set([...prev, id]));
              // Optimistically remove item for immediate UI feedback.
              setEntries((prev) => prev.filter((e) => e.id !== id));
              console.log("Deleting entry", { id });
              try {
                await deleteEntry(id, masterPassword);
              } finally {
                setDeleting((prev) => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
              }
            },
          },
        ],
      );
    },
    [masterPassword],
  );

  const handleFavorite = useCallback(
    async (id: string) => {
      if (favoriting.has(id)) return; // Prevent spam

      console.log("Toggle favorite requested", { id });
      setFavoriting((prev) => new Set([...prev, id]));
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, isFavorite: !e.isFavorite } : e,
        ),
      );
      try {
        await toggleFavorite(id, masterPassword);
      } catch (error: any) {
        // Rollback optimistic favorite toggle on failure.
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, isFavorite: !e.isFavorite } : e,
          ),
        );
        Alert.alert(
          "Toggle Failed",
          error.message || "Unable to update favorite status",
        );
      } finally {
        setFavoriting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [favoriting, masterPassword],
  );

  const onPressItem = useCallback(
    (item: PasswordEntry) => navigation.navigate("AddEdit", { entry: item }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PasswordEntry; index: number }) => (
      <AnimatedListItem index={index}>
        <VaultRow
          item={item}
          isFavoriting={favoriting.has(item.id)}
          isDeleting={deleting.has(item.id)}
          onPress={onPressItem}
          onFavorite={handleFavorite}
          onCopy={handleCopy}
          onDelete={handleDelete}
        />
      </AnimatedListItem>
    ),
    [
      favoriting,
      deleting,
      onPressItem,
      handleFavorite,
      handleCopy,
      handleDelete,
    ],
  );

  return (
    <View style={styles.container}>
      {initialLoading && (
        <ScaleIn initialScale={0.9}>
          <View style={styles.loadingOverlay}>
            <View style={styles.spinnerBox}>
              <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
            <Text style={styles.loadingText}>Loading your vault…</Text>
            <Text style={styles.loadingSubtext}>Securing your passwords</Text>
          </View>
        </ScaleIn>
      )}
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require("../../assets/PassSaver_logo.jpeg")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.headerTitle}>
              Pass<Text style={styles.spanColor}>Saver</Text>
            </Text>
            <Text style={styles.headerSub}>
              {entries.length} passwords stored
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <AnimatedButton
            style={styles.settingsBtn}
            onPress={() => navigation.navigate("Settings")}
          >
            <Icon
              name={ACTION_ICONS.settings}
              size={24}
              color={COLORS.textSecondary}
            />
          </AnimatedButton>
          <AnimatedButton
            style={styles.addBtn}
            onPress={() => navigation.navigate("AddEdit", { entry: null })}
            scaleValue={0.92}
          >
            <Text style={styles.addBtnText}>+</Text>
          </AnimatedButton>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <Icon
          name={ACTION_ICONS.search}
          size={18}
          color={COLORS.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search passwords..."
          placeholderTextColor={COLORS.textSecondary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Icon name="close" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        removeClippedSubviews
        initialNumToRender={12}
        windowSize={7}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchVault()}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <FadeIn delay={200} duration={400}>
            <View style={styles.empty}>
              <View style={styles.emptyIconBox}>
                <Icon
                  name={ACTION_ICONS.security}
                  size={48}
                  color={COLORS.textSecondary}
                />
              </View>
              <Text style={styles.emptyText}>No passwords yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first entry</Text>
            </View>
          </FadeIn>
        }
      />
    </View>
  );
}

const VaultRow = React.memo(function VaultRow({
  item,
  isFavoriting,
  isDeleting,
  onPress,
  onFavorite,
  onCopy,
  onDelete,
}: {
  item: PasswordEntry;
  isFavoriting: boolean;
  isDeleting: boolean;
  onPress: (item: PasswordEntry) => void;
  onFavorite: (id: string) => void;
  onCopy: (password: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.cardLeft}>
        <View style={styles.categoryIcon}>
          <Icon
            name={CATEGORY_ICONS[item.category]}
            size={24}
            color={COLORS.accent}
          />
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.isFavorite && (
              <Icon
                name="star"
                size={14}
                color={COLORS.warning}
                style={{ marginLeft: SPACING.xs }}
              />
            )}
          </View>
          <Text style={styles.cardUser} numberOfLines={1}>
            {item.username}
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <AnimatedButton
          style={[styles.actionBtn, isFavoriting && styles.actionBtnLoading]}
          onPress={() => onFavorite(item.id)}
          disabled={isFavoriting}
        >
          <Icon
            name={item.isFavorite ? "star" : "star-outline"}
            size={20}
            color={COLORS.accent}
          />
        </AnimatedButton>
        <AnimatedButton
          style={styles.actionBtn}
          onPress={() => onCopy(item.password)}
        >
          <Icon
            name={ACTION_ICONS.copy}
            size={20}
            color={COLORS.textSecondary}
          />
        </AnimatedButton>
        <AnimatedButton
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => onDelete(item.id, item.title)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={COLORS.danger} />
          ) : (
            <Icon name={ACTION_ICONS.delete} size={20} color={COLORS.danger} />
          )}
        </AnimatedButton>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    gap: SPACING.md,
  },
  spinnerBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.md,
  },
  loadingText: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
  },
  loadingSubtext: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl + SPACING.md,
    paddingBottom: SPACING.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  headerLogo: {
    width: 50,
    height: 50,
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  spanColor: {
    color: COLORS.accent,
  },
  headerSub: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  headerActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "center",
  },
  settingsBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.sm,
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.glow,
  },
  addBtnText: {
    fontSize: 24,
    fontWeight: FONTS.weights.bold,
    color: COLORS.background,
    lineHeight: 28,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    height: 50,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.md,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    justifyContent: "space-between",
    ...SHADOWS.md,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    flex: 1,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.sm,
  },
  cardInfo: { flex: 1 },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  cardUser: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  cardActions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.sm,
  },
  deleteBtn: {
    backgroundColor: "#ff4d6d22",
  },
  actionBtnLoading: {
    opacity: 0.7,
  },
  empty: {
    alignItems: "center",
    paddingTop: SPACING.xxl * 2,
    gap: SPACING.lg,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
    ...SHADOWS.md,
  },
  emptyText: {
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
});
