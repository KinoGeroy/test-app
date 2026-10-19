import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MATCHES_URL } from '../config';
import { FavoriteButton } from '../components/FavoriteButton';
import { UpdatedAgo } from '../components/UpdatedAgo';
import { useFavorites } from '../hooks/useFavorites';

type Team = {
  name: string;
  city?: string;
};

type Score = {
  home: number;
  away: number;
};

type Match = {
  id: string;
  startsAt: string | null;
  status: string;
  home: Team;
  away: Team;
  score?: Score | null;
  minute?: number;
};

type MatchFilter = 'all' | 'upcoming' | 'finished';

const FILTERS: { key: MatchFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'upcoming', label: 'Предстоящие' },
  { key: 'finished', label: 'Завершённые' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseMatches(payload: unknown): Match[] {
  if (!isRecord(payload) || !Array.isArray(payload.matches)) {
    throw new Error('Некорректный формат списка матчей');
  }

  return payload.matches.map((value, index) => {
    if (!isRecord(value) || !isRecord(value.home) || !isRecord(value.away)) {
      throw new Error(`Некорректные данные матча №${index + 1}`);
    }

    const { id, status, startsAt, score, minute } = value;
    const { home, away } = value;

    if (
      typeof id !== 'string' ||
      typeof status !== 'string' ||
      typeof home.name !== 'string' ||
      typeof away.name !== 'string' ||
      (startsAt !== null && typeof startsAt !== 'string')
    ) {
      throw new Error(`Некорректные данные матча №${index + 1}`);
    }

    const parsedScore =
      isRecord(score) &&
      typeof score.home === 'number' &&
      typeof score.away === 'number'
        ? { home: score.home, away: score.away }
        : null;

    return {
      id,
      status,
      startsAt,
      home: {
        name: home.name,
        city: typeof home.city === 'string' ? home.city : undefined,
      },
      away: {
        name: away.name,
        city: typeof away.city === 'string' ? away.city : undefined,
      },
      score: parsedScore,
      minute: typeof minute === 'number' ? minute : undefined,
    };
  });
}

function formatDate(startsAt: string | null): string {
  if (!startsAt) {
    return 'Дата не назначена';
  }

  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return 'Дата уточняется';
  }

  // Без timeZone: дата и время форматируются в часовом поясе устройства.
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(match: Match): string {
  switch (match.status) {
    case 'scheduled':
      return 'Запланирован';
    case 'finished':
      return 'Завершён';
    case 'live':
      return typeof match.minute === 'number' ? `Идёт · ${match.minute}′` : 'Идёт';
    case 'postponed':
      return 'Перенесён';
    default:
      return 'Другой статус';
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'live':
      return styles.statusLive;
    case 'finished':
      return styles.statusFinished;
    case 'postponed':
      return styles.statusPostponed;
    default:
      return styles.statusScheduled;
  }
}

function MatchCard({
  match,
  favorite,
  onToggleFavorite,
}: {
  match: Match;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const score = match.score ? `${match.score.home} : ${match.score.away}` : '—';

  return (
    <View style={styles.card}>
      <View style={styles.cardMeta}>
        <Text style={styles.date}>{formatDate(match.startsAt)}</Text>
        <View style={[styles.statusBadge, getStatusStyle(match.status)]}>
          <Text style={styles.statusText}>{getStatusLabel(match)}</Text>
        </View>
      </View>

      <View style={styles.matchDetails}>
        <View style={styles.teams}>
          <View style={styles.team}>
            <Text style={styles.teamName} numberOfLines={1}>
              {match.home.name}
            </Text>
            {match.home.city ? <Text style={styles.city}>{match.home.city}</Text> : null}
          </View>
          <View style={styles.team}>
            <Text style={styles.teamName} numberOfLines={1}>
              {match.away.name}
            </Text>
            {match.away.city ? <Text style={styles.city}>{match.away.city}</Text> : null}
          </View>
        </View>

        <Text style={styles.score}>{score}</Text>
        <FavoriteButton active={favorite} onPress={onToggleFavorite} />
      </View>
    </View>
  );
}

export function MatchesScreen() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [filter, setFilter] = useState<MatchFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { favorites, isFavorite, toggle } = useFavorites();

  const loadMatches = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(MATCHES_URL);
      if (!response.ok) {
        throw new Error('Не удалось получить список матчей');
      }

      const payload: unknown = await response.json();
      setMatches(parseMatches(payload));
      setUpdatedAt(new Date());
    } catch {
      setError('Не удалось загрузить матчи. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  const visibleMatches = useMemo(() => {
    if (!matches || filter === 'all') {
      return matches ?? [];
    }

    if (filter === 'finished') {
      return matches.filter((match) => match.status === 'finished');
    }

    return matches.filter((match) => match.status === 'scheduled');
  }, [filter, matches]);

  const listHeader = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Матчи тура</Text>
          <Text style={styles.subtitle}>Расписание и результаты</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadMatches(true)}
          disabled={isRefreshing}
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.buttonPressed,
            isRefreshing && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.refreshButtonText}>
            {isRefreshing ? 'Обновляем…' : 'Обновить'}
          </Text>
        </Pressable>
      </View>

      {updatedAt ? <UpdatedAgo since={updatedAt} /> : null}

      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const selected = filter === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(item.key)}
              style={({ pressed }) => [
                styles.filterButton,
                selected && styles.filterButtonSelected,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && matches ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadMatches(true)}
            disabled={isRefreshing}
            style={({ pressed }) => [styles.inlineRetryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.inlineRetryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (isLoading && matches === null) {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.stateText}>Загружаем матчи…</Text>
      </View>
    );
  }

  if (error && matches === null) {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.stateTitle}>Не получилось загрузить матчи</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadMatches()}
          style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.retryButtonText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={visibleMatches.length === 0 ? styles.emptyList : styles.listContent}
      data={visibleMatches}
      extraData={favorites}
      keyExtractor={(match) => match.id}
      renderItem={({ item }) => (
        <MatchCard
          match={item}
          favorite={isFavorite(item.id)}
          onToggleFavorite={() => toggle(item.id)}
        />
      )}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            {matches?.length === 0
              ? 'Матчей пока нет'
              : filter === 'finished'
                ? 'Завершённых матчей нет'
                : filter === 'upcoming'
                  ? 'Предстоящих матчей нет'
                  : 'Матчи не найдены'}
          </Text>
          <Text style={styles.emptyText}>
            {matches?.length === 0
              ? 'Попробуйте обновить список позже.'
              : 'Выберите другой фильтр, чтобы посмотреть матчи тура.'}
          </Text>
        </View>
      }
      onRefresh={() => void loadMatches(true)}
      refreshing={isRefreshing}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#f3f5f9',
  },
  listContent: {
    padding: 16,
    paddingBottom: 28,
  },
  emptyList: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    gap: 14,
    paddingBottom: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#172033',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 14,
    color: '#7b8495',
  },
  refreshButton: {
    borderRadius: 12,
    backgroundColor: '#e6edff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: '#2457c5',
    fontWeight: '700',
    fontSize: 13,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  filterButton: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#e7eaf0',
  },
  filterButtonSelected: {
    backgroundColor: '#172033',
  },
  filterText: {
    color: '#596273',
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextSelected: {
    color: '#fff',
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    backgroundColor: '#fff0ee',
    padding: 12,
  },
  inlineErrorText: {
    flex: 1,
    color: '#a83228',
    fontSize: 13,
  },
  inlineRetryButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  inlineRetryText: {
    color: '#9d2d25',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9edf3',
    backgroundColor: '#fff',
    padding: 16,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  date: {
    flex: 1,
    color: '#717b8d',
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusScheduled: {
    backgroundColor: '#edf2ff',
  },
  statusFinished: {
    backgroundColor: '#eaf7ef',
  },
  statusLive: {
    backgroundColor: '#fff1e7',
  },
  statusPostponed: {
    backgroundColor: '#f0eef5',
  },
  statusText: {
    color: '#454e60',
    fontSize: 11,
    fontWeight: '700',
  },
  matchDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teams: {
    flex: 1,
    gap: 10,
  },
  team: {
    minWidth: 0,
  },
  teamName: {
    color: '#202a3d',
    fontSize: 15,
    fontWeight: '700',
  },
  city: {
    marginTop: 2,
    color: '#929aaa',
    fontSize: 11,
  },
  score: {
    minWidth: 48,
    color: '#172033',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  separator: {
    height: 12,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
    backgroundColor: '#f3f5f9',
  },
  stateTitle: {
    color: '#172033',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateText: {
    color: '#717b8d',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#2457c5',
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    color: '#263147',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 300,
    color: '#7b8495',
    fontSize: 13,
    textAlign: 'center',
  },
});
