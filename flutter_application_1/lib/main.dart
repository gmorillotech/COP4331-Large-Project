import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_application_1/account_center/account_center_page.dart';
import 'package:flutter_application_1/auth/auth_service.dart';
import 'package:flutter_application_1/auth/login_page.dart';
import 'package:flutter_application_1/data_collection/data_collection_screen.dart';
import 'package:flutter_application_1/map_search/map_marker_animation.dart';
import 'package:flutter_application_1/map_search/map_marker_types.dart';
import 'package:flutter_application_1/map_search/map_marker_widget.dart';
import 'package:flutter_application_1/map_search/map_search_viewport.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_application_1/config/api_config.dart';
import 'package:flutter_application_1/config/app_tuning.dart';

const String _loginRoute = '/login';
const String _mapRoute = '/map';
const String _dataCollectionRoute = '/data-collection';
const String _accountCenterRoute = '/account-center';
const String _darkMapStyle = r'''[
  {"elementType":"geometry","stylers":[{"color":"#242f3e"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#242f3e"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#746855"}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#263c3f"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#6b9a76"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#38414e"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#212a37"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9ca5b3"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#746855"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1f2835"}]},
  {"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f3d19c"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#2f3948"}]},
  {"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#17263c"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#515c6d"}]},
  {"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#17263c"}]}
]''';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  runApp(MainApp(prefs: prefs));
}

class MainApp extends StatefulWidget {
  const MainApp({super.key, required this.prefs});

  final SharedPreferences prefs;

  @override
  State<MainApp> createState() => _MainAppState();
}

class _MainAppState extends State<MainApp> {
  late final AuthService _authService;

  @override
  void initState() {
    super.initState();
    _authService = AuthService(prefs: widget.prefs)..initialize();
  }

  @override
  void dispose() {
    _authService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AuthService>.value(
      value: _authService,
      child: Consumer<AuthService>(
        builder: (context, auth, _) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            title: 'Study Space Map',
            theme: ThemeData(useMaterial3: true),
            home: auth.initializing
                ? const Scaffold(
                    body: Center(child: CircularProgressIndicator()),
                  )
                : auth.isAuthenticated
                ? const MapSearchPage()
                : const LoginPage(),
            routes: {
              _loginRoute: (_) => const LoginPage(),
              if (auth.isAuthenticated) ...{
                _mapRoute: (_) => const MapSearchPage(),
                _dataCollectionRoute: (_) => const DataCollectionScreen(),
                _accountCenterRoute: (_) => const AccountCenterPage(),
              },
            },
          );
        },
      ),
    );
  }
}

enum Severity { low, medium, high }

enum NodeKind { group, location }

enum SearchSort { relevance, distance, noise, occupancy }

const List<LocationRecord> _seededRecords = [
  LocationRecord(
    id: 'library-floor-1-quiet',
    title: 'Quiet Study',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 1',
    sublocationLabel: 'North Reading Room',
    summary: 'Good for focused work with light foot traffic.',
    statusText: 'Usually quiet at this time',
    noiseText: 'Quiet',
    occupancyText: '2 users',
    updatedAtLabel: 'Updated 2 minutes ago',
    position: LatLng(28.60024, -81.20182),
    color: Color(0xFF2A9D8F),
    severity: Severity.low,
    isFavorite: true,
  ),
  LocationRecord(
    id: 'library-floor-2-moderate',
    title: 'Collaboration Tables',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 2',
    sublocationLabel: 'West Commons',
    summary: 'Conversation-friendly seating with moderate ambient sound.',
    statusText: 'Moderate buzz near group tables',
    noiseText: 'Moderate',
    occupancyText: '9 users',
    updatedAtLabel: 'Updated 4 minutes ago',
    position: LatLng(28.60036, -81.20168),
    color: Color(0xFFFF9F1C),
    severity: Severity.medium,
    isFavorite: false,
  ),
  LocationRecord(
    id: 'library-floor-3-busy',
    title: 'Open Computer Lab',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 3',
    sublocationLabel: 'Digital Media Area',
    summary: 'High circulation zone with steady keyboard and discussion noise.',
    statusText: 'Busiest floor in the building',
    noiseText: 'Busy',
    occupancyText: '18 users',
    updatedAtLabel: 'Updated 1 minute ago',
    position: LatLng(28.60048, -81.20155),
    color: Color(0xFFD9485F),
    severity: Severity.high,
    isFavorite: false,
  ),
  LocationRecord(
    id: 'library-floor-4-empty',
    title: 'Silent Study Cubicles',
    buildingName: 'John C. Hitt Library',
    floorLabel: 'Floor 4',
    sublocationLabel: 'East Quiet Wing',
    summary: 'Sparse traffic and the calmest option in the library right now.',
    statusText: 'Mostly empty',
    noiseText: 'Very quiet',
    occupancyText: '1 user',
    updatedAtLabel: 'Updated 6 minutes ago',
    position: LatLng(28.60018, -81.20198),
    color: Color(0xFF2A9D8F),
    severity: Severity.low,
    isFavorite: true,
  ),
  LocationRecord(
    id: 'msb-floor-2-moderate',
    title: 'Study Nook',
    buildingName: 'Mathematical Sciences Building',
    floorLabel: 'Floor 2',
    sublocationLabel: 'Atrium Balcony',
    summary:
        'Reliable seating between classes with moderate hallway spillover.',
    statusText: 'Moderate between class blocks',
    noiseText: 'Moderate',
    occupancyText: '6 users',
    updatedAtLabel: 'Updated 7 minutes ago',
    position: LatLng(28.60116, -81.19886),
    color: Color(0xFF3A86FF),
    severity: Severity.medium,
    isFavorite: false,
  ),
  LocationRecord(
    id: 'student-union-food-court',
    title: 'Food Court Seating',
    buildingName: 'Student Union',
    floorLabel: 'Level 1',
    sublocationLabel: 'South Dining Hall',
    summary: 'Convenient seating but consistently loud during lunch hours.',
    statusText: 'Lunch rush is active',
    noiseText: 'Loud',
    occupancyText: '21 users',
    updatedAtLabel: 'Updated just now',
    position: LatLng(28.60192, -81.19994),
    color: Color(0xFFD9485F),
    severity: Severity.high,
    isFavorite: false,
  ),
];

class LocationRecord {
  const LocationRecord({
    required this.id,
    required this.title,
    required this.buildingName,
    required this.floorLabel,
    required this.sublocationLabel,
    required this.summary,
    required this.statusText,
    required this.noiseText,
    required this.occupancyText,
    required this.updatedAtLabel,
    required this.position,
    required this.color,
    required this.severity,
    required this.isFavorite,
  });

  final String id;
  final String title;
  final String buildingName;
  final String floorLabel;
  final String sublocationLabel;
  final String summary;
  final String statusText;
  final String noiseText;
  final String occupancyText;
  final String updatedAtLabel;
  final LatLng position;
  final Color color;
  final Severity severity;
  final bool isFavorite;

  factory LocationRecord.fromJson(Map<String, dynamic> json) {
    return LocationRecord(
      id: (json['id'] as String? ?? '').trim(),
      title: (json['title'] as String? ?? 'Study Location').trim(),
      buildingName: (json['buildingName'] as String? ?? 'Unknown Building')
          .trim(),
      floorLabel: (json['floorLabel'] as String? ?? 'Floor unknown').trim(),
      sublocationLabel: (json['sublocationLabel'] as String? ?? 'Unknown spot')
          .trim(),
      summary: (json['summary'] as String? ?? 'No summary available.').trim(),
      statusText: (json['statusText'] as String? ?? 'Status unavailable')
          .trim(),
      noiseText: _trimMetric(json['noiseText'] as String?, 'Noise unavailable'),
      occupancyText: _trimMetric(
        json['occupancyText'] as String?,
        'Occupancy unavailable',
      ),
      updatedAtLabel:
          (json['updatedAtLabel'] as String? ?? 'Update time unavailable')
              .trim(),
      position: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      color: _colorFromHex((json['color'] as String?) ?? '#3A86FF'),
      severity: _severityFromString(json['severity'] as String?),
      isFavorite: json['isFavorite'] as bool? ?? false,
    );
  }
}

class MapNode {
  const MapNode({
    required this.id,
    required this.kind,
    required this.title,
    required this.buildingName,
    required this.summary,
    required this.statusText,
    required this.noiseText,
    required this.occupancyText,
    required this.updatedAtLabel,
    required this.position,
    required this.color,
    required this.severity,
    required this.searchTerms,
    required this.badge,
    this.floorLabel,
    this.groupId,
    this.sublocationLabel,
    this.locationCount = 0,
    this.isFavorite = false,
    this.noiseValue,
    this.occupancyValue,
    this.distanceMeters,
    this.noiseBand,
    this.hasRecentData = false,
    this.isAnimated = false,
    this.updatedAtIso,
  });

  final String id;
  final NodeKind kind;
  final String title;
  final String buildingName;
  final String summary;
  final String statusText;
  final String noiseText;
  final String occupancyText;
  final String updatedAtLabel;
  final LatLng position;
  final Color color;
  final Severity severity;
  final String searchTerms;
  final String badge;
  final String? floorLabel;
  final String? groupId;
  final String? sublocationLabel;
  final int locationCount;
  final bool isFavorite;
  final double? noiseValue;
  final double? occupancyValue;
  final double? distanceMeters;
  final int? noiseBand;
  final bool hasRecentData;
  final bool isAnimated;
  final String? updatedAtIso;

  bool get isGroup => kind == NodeKind.group;

  factory MapNode.fromJson(Map<String, dynamic> json) {
    final rawKind = (json['kind'] as String? ?? 'location')
        .trim()
        .toLowerCase();
    return MapNode(
      id: (json['id'] as String? ?? '').trim(),
      kind: rawKind == 'group' ? NodeKind.group : NodeKind.location,
      title: (json['title'] as String? ?? 'Study Location').trim(),
      buildingName: (json['buildingName'] as String? ?? 'Unknown Building')
          .trim(),
      summary: (json['summary'] as String? ?? 'No summary available.').trim(),
      statusText: (json['statusText'] as String? ?? 'Status unavailable')
          .trim(),
      noiseText: _trimMetric(json['noiseText'] as String?, 'Noise unavailable'),
      occupancyText: _trimMetric(
        json['occupancyText'] as String?,
        'Occupancy unavailable',
      ),
      updatedAtLabel:
          (json['updatedAtLabel'] as String? ?? 'Update time unavailable')
              .trim(),
      position: LatLng(
        (json['lat'] as num?)?.toDouble() ?? 0,
        (json['lng'] as num?)?.toDouble() ?? 0,
      ),
      color: _colorFromHex((json['color'] as String?) ?? '#3A86FF'),
      severity: _severityFromString(json['severity'] as String?),
      searchTerms: [
        json['buildingName'],
        json['title'],
        json['floorLabel'],
        json['sublocationLabel'],
      ].whereType<String>().join(' ').toLowerCase(),
      badge: ((json['badge'] as String?) ?? '').trim().isNotEmpty
          ? (json['badge'] as String).trim()
          : (rawKind == 'group'
                ? ((json['buildingName'] as String? ?? 'B')
                      .substring(0, 1)
                      .toUpperCase())
                : _badgeForFloor(
                    (json['floorLabel'] as String? ?? '').trim(),
                    (json['title'] as String? ?? 'S').trim(),
                  )),
      floorLabel: (json['floorLabel'] as String?)?.trim(),
      groupId: (json['groupId'] as String?)?.trim(),
      sublocationLabel: (json['sublocationLabel'] as String?)?.trim(),
      locationCount: (json['locationCount'] as num?)?.toInt() ?? 0,
      isFavorite: json['isFavorite'] as bool? ?? false,
      noiseValue: (json['noiseValue'] as num?)?.toDouble(),
      occupancyValue: (json['occupancyValue'] as num?)?.toDouble(),
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      noiseBand: (json['noiseBand'] as num?)?.toInt(),
      hasRecentData: json['hasRecentData'] as bool? ?? false,
      isAnimated: json['isAnimated'] as bool? ?? false,
      updatedAtIso: (json['updatedAtIso'] as String?)?.trim(),
    );
  }
}

class MapSearchPage extends StatefulWidget {
  const MapSearchPage({super.key});

  @override
  State<MapSearchPage> createState() => _MapSearchPageState();
}

class _MapSearchPageState extends State<MapSearchPage>
    with TickerProviderStateMixin {
  static const CameraPosition _defaultCamera = CameraPosition(
    target: LatLng(28.6003, -81.2012),
    zoom: 15.4,
  );
  static const double _groupZoomThreshold = 16.35;

  final _searchController = TextEditingController();
  final _noiseMinController = TextEditingController();
  final _noiseMaxController = TextEditingController();
  final _occupancyMaxController = TextEditingController();
  final _mapViewportKey = GlobalKey();
  GoogleMapController? _mapController;
  AuthService? _authService;
  Timer? _debounce;
  Timer? _filterDebounce;
  int _searchRequestId = 0;

  List<MapNode> _records = const [];
  List<MapNode> _groups = const [];
  Map<String, Offset> _screenPoints = const {};
  List<String> _favoriteIds = const [];
  String _status = 'Loading map data...';
  String _query = '';
  String? _selectedId;
  Severity? _filter;
  bool _loading = true;
  bool _detailsExpanded = false;
  bool _projectionPending = false;
  double _zoom = _defaultCamera.zoom;
  MapSearchViewport _viewport = MapSearchViewport.fromCameraPosition(
    _defaultCamera,
  );
  List<SearchSort?> _sortOrder = const [
    SearchSort.relevance,
    SearchSort.distance,
    null,
  ];
  static const double _maxRadiusMetersCeiling =
      MobileMapSearchTuning.maxRadiusMetersCeiling;
  double _maxRadiusMeters = MobileMapSearchTuning.defaultMaxRadiusMeters;
  double? _minNoise;
  double? _maxNoise;
  double? _maxOccupancy;
  late final MarkerAnimationClock _markerClock;
  MarkerAnimationState _markerAnimation = MarkerAnimationState.zero;
  bool _showAllResults = true;
  bool _showBuildings = true;
  bool _showSpots = true;
  bool _showUsers = false;
  bool _savingFavorites = false;

  String get _baseUrl => apiBaseUrl();

  bool get _showGroups => _zoom < _groupZoomThreshold;
  List<MapNode> get _locations =>
      _records.where((n) => !n.isGroup).toList(growable: false);
  List<MapNode> get _visibleNodes =>
      _withinRadius(_filtered(_showGroups ? _groups : _locations));
  List<_FavoriteSheetEntry> get _favoriteEntries => _favoriteIds
      .map(
        (favoriteId) => _FavoriteSheetEntry(
          id: favoriteId,
          node: _findLocationById(favoriteId),
        ),
      )
      .toList(growable: false);
  List<MapNode> get _results {
    if (_query.isEmpty) return _visibleNodes;
    return _withinRadius(
      _filtered(
        [
          ..._groups,
          ..._locations,
        ].where((n) => n.searchTerms.contains(_query)).toList(),
      ),
    );
  }

  MapNode? get _selected {
    for (final node in [..._results, ..._groups, ..._locations]) {
      if (node.id == _selectedId) return node;
    }
    return _results.isNotEmpty ? _results.first : null;
  }

  @override
  void initState() {
    super.initState();
    _markerClock = MarkerAnimationClock(this)
      ..onStateChanged = () {
        setState(() {
          _markerAnimation = _markerClock.state;
        });
      };
    unawaited(_runSearch(showLoading: true));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextAuthService = Provider.of<AuthService>(context, listen: false);
    if (!identical(_authService, nextAuthService)) {
      _authService?.removeListener(_syncFavoritesFromAuth);
      _authService = nextAuthService;
      _authService?.addListener(_syncFavoritesFromAuth);
      _favoriteIds = List<String>.from(
        nextAuthService.user?.favorites ?? const <String>[],
      );
    }
  }

  @override
  void dispose() {
    _markerClock.dispose();
    _authService?.removeListener(_syncFavoritesFromAuth);
    _debounce?.cancel();
    _filterDebounce?.cancel();
    _searchController.dispose();
    _noiseMinController.dispose();
    _noiseMaxController.dispose();
    _occupancyMaxController.dispose();
    _mapController?.dispose();
    super.dispose();
  }

  void _syncFavoritesFromAuth() {
    final nextFavoriteIds = List<String>.from(
      _authService?.user?.favorites ?? const <String>[],
    );
    if (!mounted || listEquals(_favoriteIds, nextFavoriteIds)) {
      return;
    }

    setState(() {
      _favoriteIds = nextFavoriteIds;
    });
  }

  bool _isFavoriteId(String id) => _favoriteIds.contains(id);

  MapNode? _findLocationById(String id) {
    for (final location in _locations) {
      if (location.id == id) {
        return location;
      }
    }
    return null;
  }

  bool _isFavoriteNode(MapNode node) {
    if (!node.isGroup) {
      return _isFavoriteId(node.id);
    }

    return _locations.any(
      (location) => location.groupId == node.id && _isFavoriteId(location.id),
    );
  }

  int _favoriteCountForNode(MapNode node) {
    if (!node.isGroup) {
      return _isFavoriteNode(node) ? 1 : 0;
    }

    return _locations
        .where(
          (location) =>
              location.groupId == node.id && _isFavoriteId(location.id),
        )
        .length;
  }

  Future<void> _toggleFavorite(MapNode node) async {
    if (node.isGroup) {
      return;
    }

    await _toggleFavoriteById(node.id);
  }

  Future<void> _toggleFavoriteById(String locationId) async {
    if (_savingFavorites) {
      return;
    }

    final wasFavorite = _isFavoriteId(locationId);
    final nextFavorites = wasFavorite
        ? _favoriteIds
              .where((entry) => entry != locationId)
              .toList(growable: false)
        : <String>[..._favoriteIds, locationId];
    final previousFavorites = List<String>.from(_favoriteIds);

    setState(() {
      _favoriteIds = nextFavorites;
      _savingFavorites = true;
    });

    try {
      await (_authService?.saveFavorites(nextFavorites) ??
          Future<void>.value());
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _favoriteIds = previousFavorites;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Unable to ${wasFavorite ? 'remove' : 'save'} favorite right now.',
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _savingFavorites = false;
        });
      }
    }
  }

  Future<void> _openFavoritesView() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        final theme = Theme.of(sheetContext);
        final favoriteEntries = _favoriteEntries;
        final maxSheetHeight = MediaQuery.of(sheetContext).size.height * 0.72;

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: maxSheetHeight),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xFFFDFDFD),
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x33000000),
                      blurRadius: 26,
                      offset: Offset(0, 14),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'My Favorites',
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF102A43),
                            ),
                          ),
                          const Spacer(),
                          IconButton(
                            tooltip: 'Close favorites',
                            onPressed: () => Navigator.of(sheetContext).pop(),
                            icon: const Icon(Icons.close_rounded),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        favoriteEntries.isEmpty
                            ? 'Save study spots from the map to keep them here.'
                            : '${favoriteEntries.length} saved study spot${favoriteEntries.length == 1 ? '' : 's'}.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: const Color(0xFF486581),
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (favoriteEntries.isEmpty)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(22),
                            border: Border.all(color: const Color(0xFFD8E1EB)),
                          ),
                          child: const Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.favorite_border_rounded,
                                size: 28,
                                color: Color(0xFFB45309),
                              ),
                              SizedBox(height: 10),
                              Text(
                                'No favorites yet.',
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF102A43),
                                ),
                              ),
                              SizedBox(height: 6),
                              Text(
                                'Tap the heart on any study spot to save it.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Color(0xFF486581)),
                              ),
                            ],
                          ),
                        )
                      else
                        Flexible(
                          child: ListView.separated(
                            shrinkWrap: true,
                            itemCount: favoriteEntries.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 10),
                            itemBuilder: (context, index) {
                              final entry = favoriteEntries[index];
                              final node = entry.node;

                              return Material(
                                color: const Color(0xFFF8FAFC),
                                borderRadius: BorderRadius.circular(22),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(22),
                                  onTap: node == null
                                      ? null
                                      : () async {
                                          Navigator.of(sheetContext).pop();
                                          await _focusNode(node);
                                        },
                                  child: Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Row(
                                      children: [
                                        CircleAvatar(
                                          backgroundColor:
                                              node?.color ??
                                              const Color(0xFF0F766E),
                                          foregroundColor: Colors.white,
                                          child: Text(
                                            node?.badge ??
                                                entry.id
                                                    .substring(0, 1)
                                                    .toUpperCase(),
                                          ),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                node == null
                                                    ? entry.id
                                                    : _title(node),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w800,
                                                  color: Color(0xFF102A43),
                                                ),
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                node == null
                                                    ? 'Move the map or change filters to load this favorite.'
                                                    : (node.sublocationLabel ??
                                                          node.buildingName),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  color: Color(0xFF486581),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        IconButton(
                                          tooltip: 'Remove favorite',
                                          onPressed: _savingFavorites
                                              ? null
                                              : () {
                                                  Navigator.of(
                                                    sheetContext,
                                                  ).pop();
                                                  unawaited(
                                                    _toggleFavoriteById(
                                                      entry.id,
                                                    ),
                                                  );
                                                },
                                          icon: const Icon(
                                            Icons.favorite_rounded,
                                            color: Color(0xFFB91C1C),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _runSearch({bool showLoading = false}) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
    final requestId = ++_searchRequestId;
    final includeGroups = _showAllResults || _showBuildings;
    final includeLocations = _showAllResults || _showSpots;
    final sortTerms = _sortOrder
        .whereType<SearchSort>()
        .map((value) => value.name)
        .toList(growable: false);
    final queryParameters = buildMapSearchQueryParameters(
      viewport: _viewport,
      sortTerms: sortTerms,
      includeGroups: includeGroups,
      includeLocations: includeLocations,
      maxRadiusMeters: null,
      query: _query,
      minNoise: _minNoise,
      maxNoise: _maxNoise,
      maxOccupancy: _maxOccupancy,
    );

    if (showLoading || _results.isEmpty) {
      setState(() => _loading = true);
    }

    try {
      final uri = Uri.parse(
        '$_baseUrl/api/locations/search',
      ).replace(queryParameters: queryParameters);
      final request = await client
          .getUrl(uri)
          .timeout(const Duration(seconds: 6));
      final response = await request.close().timeout(
        const Duration(seconds: 6),
      );
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(const Duration(seconds: 6));

      if (response.statusCode != 200) {
        throw HttpException(
          'Map request failed with status ${response.statusCode}',
        );
      }

      final payload = jsonDecode(text) as Map<String, dynamic>;
      final error = (payload['error'] as String? ?? '').trim();
      if (error.isNotEmpty) {
        throw HttpException(error);
      }

      final results = (payload['results'] as List<dynamic>? ?? const [])
          .map(
            (entry) =>
                MapNode.fromJson(Map<String, dynamic>.from(entry as Map)),
          )
          .toList(growable: false);

      if (!mounted || requestId != _searchRequestId) {
        return;
      }

      _applyRecords(
        results,
        status:
            '${_buildGroups(results).length} buildings and ${results.length} study areas loaded',
      );
    } catch (error) {
      _applyRecords(
        _fallbackNodes(),
        status:
            'API unavailable at $_baseUrl. Using seeded map data for local testing.',
      );
    } finally {
      client.close(force: true);
    }
  }

  List<MapNode> _buildGroups(List<MapNode> nodes) =>
      nodes.where((n) => n.isGroup).toList(growable: false);

  void _applyRecords(List<MapNode> records, {required String status}) {
    final groups = _buildGroups(records);
    setState(() {
      _records = records;
      _groups = groups;
      _selectedId = groups.isNotEmpty ? groups.first.id : null;
      _status = status;
      _loading = false;
    });
    _scheduleProjectionRefresh();
  }

  List<MapNode> _fallbackNodes() {
    final locationNodes = _seededRecords
        .map(
          (record) {
            final band = _fallbackNoiseBand(record.severity);
            final animated = record.severity != Severity.low;
            return MapNode(
              id: record.id,
              kind: NodeKind.location,
              title: record.title,
              buildingName: record.buildingName,
              summary: record.summary,
              statusText: record.statusText,
              noiseText: record.noiseText,
              occupancyText: record.occupancyText,
              updatedAtLabel: record.updatedAtLabel,
              position: record.position,
              color: record.color,
              severity: record.severity,
              searchTerms:
                  '${record.buildingName} ${record.floorLabel} ${record.sublocationLabel} ${record.title}'
                      .toLowerCase(),
              badge: _badgeForFloor(record.floorLabel, record.title),
              floorLabel: record.floorLabel,
              groupId: _groupId(record.buildingName),
              sublocationLabel: record.sublocationLabel,
              isFavorite: record.isFavorite,
              noiseBand: band,
              hasRecentData: true,
              isAnimated: animated,
              updatedAtIso: DateTime.now().toIso8601String(),
            );
          },
        )
        .toList(growable: false);

    final grouped = <String, List<MapNode>>{};
    for (final node in locationNodes) {
      grouped.putIfAbsent(node.buildingName, () => []).add(node);
    }

    final groupNodes = grouped.entries
        .map((entry) {
          final items = entry.value;
          final lat =
              items.map((e) => e.position.latitude).reduce((a, b) => a + b) /
              items.length;
          final lng =
              items.map((e) => e.position.longitude).reduce((a, b) => a + b) /
              items.length;
          final severityIndex = items
              .map((e) => e.severity.index)
              .reduce((a, b) => a > b ? a : b);
          final quietCount = items
              .where((e) => e.severity == Severity.low)
              .length;
          final groupSeverity = Severity.values[severityIndex];
          final groupBand = _fallbackNoiseBand(groupSeverity);
          final groupAnimated = items.any((e) => e.isAnimated);
          return MapNode(
            id: _groupId(entry.key),
            kind: NodeKind.group,
            title: entry.key,
            buildingName: entry.key,
            summary:
                '${items.length} study areas, $quietCount quiet option${quietCount == 1 ? '' : 's'}.',
            statusText: 'Building overview',
            noiseText: _severityLabel(groupSeverity),
            occupancyText: '${items.length} reported study areas',
            updatedAtLabel: items.first.updatedAtLabel,
            position: LatLng(lat, lng),
            color: items.first.color,
            severity: groupSeverity,
            searchTerms: items
                .expand(
                  (e) => [
                    entry.key,
                    e.floorLabel ?? '',
                    e.sublocationLabel ?? '',
                    e.title,
                  ],
                )
                .join(' ')
                .toLowerCase(),
            badge: entry.key.substring(0, 1).toUpperCase(),
            locationCount: items.length,
            isFavorite: items.any((e) => e.isFavorite),
            noiseBand: groupBand,
            hasRecentData: true,
            isAnimated: groupAnimated,
            updatedAtIso: DateTime.now().toIso8601String(),
          );
        })
        .toList(growable: false);

    final nodes = <MapNode>[
      if (_showAllResults || _showBuildings) ...groupNodes,
      if (_showAllResults || _showSpots) ...locationNodes,
    ];

    return nodes
        .where((node) => _query.isEmpty || node.searchTerms.contains(_query))
        .toList(growable: false);
  }

  List<MapNode> _filtered(List<MapNode> nodes) => _filter == null
      ? nodes
      : nodes.where((n) => n.severity == _filter).toList(growable: false);

  List<MapNode> _withinRadius(List<MapNode> nodes) {
    if (_maxRadiusMeters >= _maxRadiusMetersCeiling) return nodes;
    return nodes
        .where((n) =>
            n.distanceMeters == null || n.distanceMeters! <= _maxRadiusMeters)
        .toList(growable: false);
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(MobileMapSearchTuning.searchDebounce, () {
      if (!mounted) return;
      setState(() => _query = value.trim().toLowerCase());
      unawaited(_runSearch());
    });
  }

  void _setSortAt(int index, SearchSort? sort) {
    final nextOrder = [..._sortOrder];
    nextOrder[index] = sort;
    final normalized = <SearchSort?>[];
    final seen = <SearchSort>{};
    for (final value in nextOrder) {
      if (value == null) {
        normalized.add(null);
      } else if (seen.add(value)) {
        normalized.add(value);
      } else {
        normalized.add(null);
      }
    }
    setState(() => _sortOrder = normalized);
    unawaited(_runSearch());
  }

  void _scheduleFilterSearch() {
    _filterDebounce?.cancel();
    _filterDebounce = Timer(MobileMapSearchTuning.filterDebounce, () {
      if (!mounted) return;
      unawaited(_runSearch());
    });
  }

  void _toggleShowAll(bool value) {
    setState(() {
      _showAllResults = value;
      _showBuildings = value;
      _showSpots = value;
      _showUsers = value;
    });
    unawaited(_runSearch());
  }

  void _toggleShowItem({
    required bool value,
    required void Function(bool) assign,
  }) {
    setState(() {
      assign(value);
      _showAllResults = _showBuildings && _showSpots && _showUsers;
    });
    unawaited(_runSearch());
  }

  void _onNoiseChanged() {
    setState(() {
      _minNoise = double.tryParse(_noiseMinController.text.trim());
      _maxNoise = double.tryParse(_noiseMaxController.text.trim());
    });
    _scheduleFilterSearch();
  }

  void _onOccupancyChanged(String value) {
    setState(() => _maxOccupancy = double.tryParse(value.trim()));
    _scheduleFilterSearch();
  }

  Future<void> _focusNode(MapNode node) async {
    final targetNode = node.isGroup
        ? _locations.firstWhere(
            (candidate) => candidate.groupId == node.id,
            orElse: () => node,
          )
        : node;

    setState(() {
      _selectedId = targetNode.id;
      _detailsExpanded = false;
      _screenPoints = const {};
    });

    await _mapController?.animateCamera(
      CameraUpdate.newCameraPosition(
        CameraPosition(
          target: node.position,
          zoom: node.isGroup ? 17.15 : 18.05,
        ),
      ),
    );
  }

  void _onCameraMove(CameraPosition position) {
    final previousGroupView = _showGroups;
    final nextViewport = MapSearchViewport.fromCameraPosition(position);
    final nextZoom = nextViewport.zoom;
    final nextGroupView = nextZoom < _groupZoomThreshold;
    final zoomChanged = nextZoom != _zoom;
    final centerChanged = nextViewport.center != _viewport.center;
    if (!zoomChanged && !centerChanged) return;
    setState(() {
      _zoom = nextZoom;
      _viewport = nextViewport;
      _screenPoints = const {};
    });
    if (previousGroupView != nextGroupView) _syncSelectionToZoom(nextGroupView);
    _scheduleProjectionRefresh();
  }

  void _scheduleProjectionRefresh() {
    if (_projectionPending) return;
    _projectionPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      _projectionPending = false;
      await _refreshOverlayProjection();
    });
  }

  Future<void> _refreshOverlayProjection() async {
    final controller = _mapController;
    final context = _mapViewportKey.currentContext;

    if (!mounted || controller == null || context == null) {
      return;
    }

    final box = context.findRenderObject() as RenderBox?;

    if (box == null || !box.hasSize) {
      return;
    }

    final devicePixelRatio = MediaQuery.of(context).devicePixelRatio;
    final nextPoints = <String, Offset>{};

    for (final node in _visibleNodes) {
      final screenCoordinate = await controller.getScreenCoordinate(
        node.position,
      );
      final dx = screenCoordinate.x / devicePixelRatio;
      final dy = screenCoordinate.y / devicePixelRatio;

      if (dx < -80 ||
          dy < -80 ||
          dx > box.size.width + 80 ||
          dy > box.size.height + 80) {
        continue;
      }

      nextPoints[node.id] = Offset(dx, dy);
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _screenPoints = nextPoints;
    });
  }

  void _syncSelectionToZoom(bool groupView) {
    final selected = _selected;
    if (selected == null) return;
    if (groupView && !selected.isGroup && selected.groupId != null) {
      setState(() {
        _selectedId = selected.groupId;
        _detailsExpanded = false;
      });
    } else if (!groupView && selected.isGroup) {
      final child = _locations
          .where((n) => n.groupId == selected.id)
          .cast<MapNode?>()
          .firstWhere((n) => n != null, orElse: () => null);
      if (child != null) {
        setState(() {
          _selectedId = child.id;
          _detailsExpanded = false;
        });
      }
    }
  }

  String _usersPresentText(MapNode node) {
    if (node.isGroup) {
      return '${node.locationCount} active study areas';
    }

    final match = RegExp(r'(\d+)').firstMatch(node.occupancyText);
    final count = int.tryParse(match?.group(1) ?? '');
    if (count == null) {
      return node.occupancyText;
    }
    return count == 1 ? '1 user present' : '$count users present';
  }

  String _usualBusinessText(MapNode node) {
    if (node.isGroup) {
      return 'Aggregated building activity from nearby study spots';
    }
    return node.statusText;
  }

  Future<void> _openDataCollection() async {
    final selected = _selected;
    final selectedLocationId = selected != null && !selected.isGroup
        ? selected.id
        : null;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            DataCollectionScreen(initialStudyLocationId: selectedLocationId),
      ),
    );

    if (!mounted) {
      return;
    }

    unawaited(_runSearch(showLoading: true));
  }

  Future<void> _openAccountCenter() async {
    await Navigator.of(context).pushNamed(_accountCenterRoute);
  }

  Future<void> _logout() async {
    final shouldLogout = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Log out?'),
          content: const Text(
            'This will clear the saved session on this device and return to the login screen.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Log out'),
            ),
          ],
        );
      },
    );

    if (shouldLogout != true || !mounted) {
      return;
    }

    await Provider.of<AuthService>(context, listen: false).logout();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F7FB),
      appBar: AppBar(
        title: const Text('Study Space Search'),
        backgroundColor: Colors.transparent,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                IconButton(
                  tooltip: 'Open favorites',
                  onPressed: _openFavoritesView,
                  icon: const Icon(Icons.favorite_border_rounded),
                ),
                if (_favoriteIds.isNotEmpty)
                  Positioned(
                    right: 6,
                    top: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFB91C1C),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${_favoriteIds.length}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Open account center',
            onPressed: _openAccountCenter,
            icon: const Icon(Icons.account_circle_outlined),
          ),
          IconButton(
            tooltip: 'Open data collection',
            onPressed: _openDataCollection,
            icon: const Icon(Icons.mic_rounded),
          ),
          IconButton(
            tooltip: 'Log out',
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded),
          ),
        ],
      ),
      body: Stack(
        children: [
          Positioned.fill(child: _buildMapStack(context)),
          Positioned(
            top: 12,
            right: 12,
            child: SafeArea(
              child: Material(
                color: Colors.white,
                shape: const CircleBorder(),
                elevation: 4,
                child: IconButton(
                  tooltip: 'Search & filters',
                  icon: const Icon(Icons.search, color: Color(0xFF102A43)),
                  onPressed: _openSearchSheet,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMapStack(BuildContext context) {
    final visibleNodes = _visibleNodes;
    final selected = _selected;
    return Stack(
      children: [
        RepaintBoundary(
          key: _mapViewportKey,
          child: GoogleMap(
            initialCameraPosition: _defaultCamera,
            style: _darkMapStyle,
            markers: const <Marker>{},
            myLocationButtonEnabled: false,
            mapToolbarEnabled: false,
            zoomControlsEnabled: false,
            onMapCreated: (controller) {
              _mapController = controller;
              _scheduleProjectionRefresh();
            },
            onCameraMove: _onCameraMove,
            onCameraIdle: () {
              _scheduleProjectionRefresh();
              unawaited(_runSearch());
            },
            onTap: (_) => setState(() {
              _selectedId = null;
              _detailsExpanded = false;
            }),
          ),
        ),
        Positioned.fill(
          child: IgnorePointer(
            child: Stack(
              children: visibleNodes
                  .map((node) {
                    final point = _screenPoints[node.id];
                    if (point == null) return const SizedBox.shrink();
                    final size = _heatSize(node, _zoom);
                    final heat = _heatColor(node);
                    return Positioned(
                      left: point.dx - (size / 2),
                      top: point.dy - (size / 2),
                      width: size,
                      height: size,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [
                              heat.withValues(alpha: 0.34),
                              heat.withValues(alpha: 0.2),
                              heat.withValues(alpha: 0.08),
                              Colors.transparent,
                            ],
                            stops: const [0.0, 0.28, 0.58, 1.0],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: heat.withValues(alpha: 0.2),
                              blurRadius: 28,
                              spreadRadius: 8,
                            ),
                          ],
                        ),
                      ),
                    );
                  })
                  .toList(growable: false),
            ),
          ),
        ),
        Positioned.fill(
          child: Stack(
            children: visibleNodes
                .map((node) {
                  final point = _screenPoints[node.id];
                  if (point == null) return const SizedBox.shrink();
                  return _overlayMarker(node, point);
                })
                .toList(growable: false),
          ),
        ),
        if (_loading)
          const ColoredBox(
            color: Color(0x55FFFFFF),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (selected != null)
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              child: _detailCard(context, selected),
            ),
          ),
      ],
    );
  }

  Future<void> _openSearchSheet() async {
    final theme = Theme.of(context);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        final maxSheetHeight =
            MediaQuery.of(sheetContext).size.height * 0.9;
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            void refresh(VoidCallback fn) {
              setState(fn);
              setSheetState(() {});
            }

            Future<void> handleCardTap(MapNode node) async {
              Navigator.of(sheetContext).pop();
              await _focusNode(node);
            }

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxSheetHeight),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFFFDFDFD),
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x33000000),
                          blurRadius: 26,
                          offset: Offset(0, 14),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                'Search',
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: const Color(0xFF102A43),
                                ),
                              ),
                              const Spacer(),
                              IconButton(
                                tooltip: 'Close search',
                                onPressed: () =>
                                    Navigator.of(sheetContext).pop(),
                                icon: const Icon(Icons.close_rounded),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Flexible(
                            child: SingleChildScrollView(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  TextField(
                                    controller: _searchController,
                                    onChanged: (value) {
                                      setSheetState(() {});
                                      _onSearch(value);
                                    },
                                    decoration: InputDecoration(
                                      hintText:
                                          'Search Library or Quiet Study',
                                      prefixIcon: const Icon(Icons.search),
                                      suffixIcon:
                                          _searchController.text.isEmpty
                                          ? null
                                          : IconButton(
                                              onPressed: () {
                                                _searchController.clear();
                                                setSheetState(() {});
                                                _onSearch('');
                                              },
                                              icon: const Icon(Icons.close),
                                            ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      border: OutlineInputBorder(
                                        borderRadius:
                                            BorderRadius.circular(20),
                                        borderSide: BorderSide.none,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Container(
                                    padding: const EdgeInsets.all(14),
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(22),
                                      border: Border.all(
                                        color: const Color(0xFFD8E1EB),
                                      ),
                                    ),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        _sectionLabel('Sort Order'),
                                        const SizedBox(height: 8),
                                        _sortDropdown('1st by', 0),
                                        const SizedBox(height: 8),
                                        _sortDropdown('2nd by', 1),
                                        const SizedBox(height: 8),
                                        _sortDropdown('3rd by', 2),
                                        const SizedBox(height: 14),
                                        _sectionLabel('Distance'),
                                        Slider(
                                          value: _maxRadiusMeters,
                                          min: 100,
                                          max: _maxRadiusMetersCeiling,
                                          divisions: 8,
                                          label:
                                              '${_maxRadiusMeters.round()} m',
                                          onChanged: (value) => refresh(
                                            () => _maxRadiusMeters = value,
                                          ),
                                        ),
                                        Align(
                                          alignment: Alignment.centerRight,
                                          child: Text(
                                            'Up to ${_maxRadiusMeters.round()} m',
                                            style: theme.textTheme.bodySmall
                                                ?.copyWith(
                                                  color: const Color(
                                                    0xFF486581,
                                                  ),
                                                ),
                                          ),
                                        ),
                                        const SizedBox(height: 14),
                                        _sectionLabel('Noise (dB)'),
                                        const SizedBox(height: 8),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: _numberField(
                                                controller:
                                                    _noiseMinController,
                                                label: 'Min',
                                                onChanged: (_) =>
                                                    _onNoiseChanged(),
                                              ),
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: _numberField(
                                                controller:
                                                    _noiseMaxController,
                                                label: 'Max',
                                                onChanged: (_) =>
                                                    _onNoiseChanged(),
                                              ),
                                            ),
                                          ],
                                        ),
                                        const SizedBox(height: 14),
                                        _sectionLabel('Max Occupancy'),
                                        const SizedBox(height: 8),
                                        _numberField(
                                          controller: _occupancyMaxController,
                                          label: '0.0 to 5.0',
                                          onChanged: _onOccupancyChanged,
                                        ),
                                        const SizedBox(height: 14),
                                        _sectionLabel('Show'),
                                        const SizedBox(height: 8),
                                        Wrap(
                                          spacing: 10,
                                          runSpacing: 6,
                                          children: [
                                            _showCheckbox(
                                              label: 'All results',
                                              value: _showAllResults,
                                              onChanged: (value) {
                                                _toggleShowAll(value ?? false);
                                                setSheetState(() {});
                                              },
                                            ),
                                            _showCheckbox(
                                              label: 'Buildings',
                                              value: _showBuildings,
                                              onChanged: (value) {
                                                _toggleShowItem(
                                                  value: value ?? false,
                                                  assign: (next) =>
                                                      _showBuildings = next,
                                                );
                                                setSheetState(() {});
                                              },
                                            ),
                                            _showCheckbox(
                                              label: 'Spots',
                                              value: _showSpots,
                                              onChanged: (value) {
                                                _toggleShowItem(
                                                  value: value ?? false,
                                                  assign: (next) =>
                                                      _showSpots = next,
                                                );
                                                setSheetState(() {});
                                              },
                                            ),
                                            _showCheckbox(
                                              label: 'Users',
                                              value: _showUsers,
                                              onChanged: (value) {
                                                _toggleShowItem(
                                                  value: value ?? false,
                                                  assign: (next) =>
                                                      _showUsers = next,
                                                );
                                                setSheetState(() {});
                                              },
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Text(
                                    '$_status ${_favoriteIds.isEmpty ? '' : '| ${_favoriteIds.length} favorite${_favoriteIds.length == 1 ? '' : 's'} saved'}',
                                    style: theme.textTheme.bodySmall
                                        ?.copyWith(
                                          color: const Color(0xFF64748B),
                                        ),
                                  ),
                                  const SizedBox(height: 12),
                                  SizedBox(
                                    height: 210,
                                    child: _loading
                                        ? const Center(
                                            child: CircularProgressIndicator(),
                                          )
                                        : _results.isEmpty
                                        ? Center(
                                            child: Padding(
                                              padding:
                                                  const EdgeInsets.all(24),
                                              child: Text(
                                                _query.isEmpty
                                                    ? 'No study spots in this area yet. Pan the map to explore.'
                                                    : 'No building or location matches your search and filters.',
                                                textAlign: TextAlign.center,
                                              ),
                                            ),
                                          )
                                        : ListView.separated(
                                            padding:
                                                const EdgeInsets.fromLTRB(
                                                  4,
                                                  4,
                                                  4,
                                                  8,
                                                ),
                                            scrollDirection: Axis.horizontal,
                                            itemCount: _results.length,
                                            separatorBuilder: (_, _) =>
                                                const SizedBox(width: 12),
                                            itemBuilder: (context, index) {
                                              final node = _results[index];
                                              final selectedNode =
                                                  node.id == _selectedId;
                                              final favoriteCount =
                                                  _favoriteCountForNode(node);
                                              final isFavorite =
                                                  _isFavoriteNode(node);
                                              return SizedBox(
                                                width: 300,
                                                child: Material(
                                                  color: selectedNode
                                                      ? node.color.withValues(
                                                          alpha: 0.14,
                                                        )
                                                      : Colors.white,
                                                  borderRadius:
                                                      BorderRadius.circular(
                                                        22,
                                                      ),
                                                  child: InkWell(
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          22,
                                                        ),
                                                    onTap: () =>
                                                        handleCardTap(node),
                                                    child: Container(
                                                      padding:
                                                          const EdgeInsets.all(
                                                            16,
                                                          ),
                                                      decoration: BoxDecoration(
                                                        borderRadius:
                                                            BorderRadius.circular(
                                                              22,
                                                            ),
                                                        border: Border.all(
                                                          color: selectedNode
                                                              ? node.color
                                                              : const Color(
                                                                  0xFFD5DEEA,
                                                                ),
                                                        ),
                                                      ),
                                                      child: Row(
                                                        crossAxisAlignment:
                                                            CrossAxisAlignment
                                                                .start,
                                                        children: [
                                                          Column(
                                                            mainAxisSize:
                                                                MainAxisSize
                                                                    .min,
                                                            children: [
                                                              CircleAvatar(
                                                                backgroundColor:
                                                                    node.color,
                                                                foregroundColor:
                                                                    Colors
                                                                        .white,
                                                                child: Text(
                                                                  node.badge,
                                                                ),
                                                              ),
                                                              if (isFavorite) ...[
                                                                const SizedBox(
                                                                  height: 8,
                                                                ),
                                                                const Icon(
                                                                  Icons
                                                                      .favorite_rounded,
                                                                  size: 18,
                                                                  color: Color(
                                                                    0xFFB45309,
                                                                  ),
                                                                ),
                                                              ],
                                                            ],
                                                          ),
                                                          const SizedBox(
                                                            width: 12,
                                                          ),
                                                          Expanded(
                                                            child: Column(
                                                              crossAxisAlignment:
                                                                  CrossAxisAlignment
                                                                      .start,
                                                              children: [
                                                                Row(
                                                                  children: [
                                                                    Expanded(
                                                                      child: Text(
                                                                        _title(
                                                                          node,
                                                                        ),
                                                                        maxLines:
                                                                            2,
                                                                        overflow:
                                                                            TextOverflow.ellipsis,
                                                                        style: const TextStyle(
                                                                          fontWeight:
                                                                              FontWeight.w700,
                                                                          color: Color(
                                                                            0xFF102A43,
                                                                          ),
                                                                        ),
                                                                      ),
                                                                    ),
                                                                    const SizedBox(
                                                                      width: 8,
                                                                    ),
                                                                    _pill(
                                                                      node.isGroup
                                                                          ? 'Building'
                                                                          : 'Spot',
                                                                    ),
                                                                  ],
                                                                ),
                                                                const SizedBox(
                                                                  height: 6,
                                                                ),
                                                                Text(
                                                                  node.isGroup
                                                                      ? '${node.locationCount} study areas'
                                                                      : (node.sublocationLabel ??
                                                                            ''),
                                                                  maxLines: 1,
                                                                  overflow:
                                                                      TextOverflow
                                                                          .ellipsis,
                                                                  style: const TextStyle(
                                                                    fontWeight:
                                                                        FontWeight
                                                                            .w600,
                                                                    color: Color(
                                                                      0xFF0F766E,
                                                                    ),
                                                                  ),
                                                                ),
                                                                const SizedBox(
                                                                  height: 6,
                                                                ),
                                                                Text(
                                                                  node.summary,
                                                                  maxLines: 3,
                                                                  overflow:
                                                                      TextOverflow
                                                                          .ellipsis,
                                                                  style: const TextStyle(
                                                                    color: Color(
                                                                      0xFF486581,
                                                                    ),
                                                                  ),
                                                                ),
                                                                if (node.isGroup &&
                                                                    favoriteCount >
                                                                        0) ...[
                                                                  const SizedBox(
                                                                    height: 10,
                                                                  ),
                                                                  Text(
                                                                    '$favoriteCount saved spot${favoriteCount == 1 ? '' : 's'} in this building',
                                                                    style: const TextStyle(
                                                                      color: Color(
                                                                        0xFFB45309,
                                                                      ),
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .w700,
                                                                    ),
                                                                  ),
                                                                ],
                                                              ],
                                                            ),
                                                          ),
                                                          if (!node.isGroup)
                                                            IconButton(
                                                              tooltip:
                                                                  isFavorite
                                                                  ? 'Remove from favorites'
                                                                  : 'Add to favorites',
                                                              onPressed:
                                                                  _savingFavorites
                                                                  ? null
                                                                  : () async {
                                                                      await _toggleFavorite(
                                                                        node,
                                                                      );
                                                                      setSheetState(
                                                                        () {},
                                                                      );
                                                                    },
                                                              icon: Icon(
                                                                isFavorite
                                                                    ? Icons
                                                                          .favorite_rounded
                                                                    : Icons
                                                                          .favorite_border_rounded,
                                                                color:
                                                                    isFavorite
                                                                    ? const Color(
                                                                        0xFFB91C1C,
                                                                      )
                                                                    : const Color(
                                                                        0xFF64748B,
                                                                      ),
                                                              ),
                                                            ),
                                                        ],
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              );
                                            },
                                          ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _sectionLabel(String label) => Text(
    label,
    style: const TextStyle(
      color: Color(0xFF102A43),
      fontWeight: FontWeight.w800,
      fontSize: 13,
    ),
  );

  Widget _sortDropdown(String label, int index) {
    return DropdownButtonFormField<SearchSort?>(
      initialValue: _sortOrder[index],
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
      ),
      items: [
        const DropdownMenuItem<SearchSort?>(value: null, child: Text('None')),
        ...SearchSort.values.map(
          (option) => DropdownMenuItem<SearchSort?>(
            value: option,
            child: Text(_sortLabel(option)),
          ),
        ),
      ],
      onChanged: (value) => _setSortAt(index, value),
    );
  }

  Widget _numberField({
    required TextEditingController controller,
    required String label,
    required ValueChanged<String> onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD8E1EB)),
        ),
      ),
    );
  }

  Widget _showCheckbox({
    required String label,
    required bool value,
    required ValueChanged<bool?> onChanged,
  }) {
    return IntrinsicWidth(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0xFFD8E1EB)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Checkbox(
              value: value,
              onChanged: onChanged,
              visualDensity: VisualDensity.compact,
            ),
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF334E68),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _overlayMarker(MapNode node, Offset point) {
    final selected = node.id == _selectedId;
    final isSub = node.sublocationLabel != null && !node.isGroup;
    final size = _markerSize(_zoom, node.isGroup, isSub, selected);
    final left = point.dx - (size / 2);
    final top = point.dy - size;

    return Positioned(
      left: left,
      top: top,
      width: size,
      height: size,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => _focusNode(node),
        child: MapMarkerVisual(
          size: size,
          isAnimated: node.isAnimated,
          noiseBand: node.noiseBand,
          isSub: isSub,
          isSelected: selected,
          animation: _markerAnimation,
        ),
      ),
    );
  }

  Widget _detailCard(BuildContext context, MapNode node) {
    final isFavorite = _isFavoriteNode(node);
    final favoriteCount = _favoriteCountForNode(node);
    final maxHeight = node.isGroup ? 336.0 : 352.0;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      constraints: BoxConstraints(
        maxWidth: 440,
        maxHeight: _detailsExpanded ? maxHeight : 188,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 24,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: node.isGroup ? 22 : 20,
                    backgroundColor: node.color,
                    foregroundColor: Colors.white,
                    child: Text(node.badge),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _title(node),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: const Color(0xFF102A43),
                              ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          node.isGroup
                              ? '${node.locationCount} study areas in this building'
                              : (node.sublocationLabel ?? node.buildingName),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: const Color(0xFF0F766E),
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () =>
                        setState(() => _detailsExpanded = !_detailsExpanded),
                    icon: Icon(
                      _detailsExpanded ? Icons.expand_more : Icons.expand_less,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                node.summary,
                maxLines: _detailsExpanded ? 3 : 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF486581),
                ),
              ),
              const SizedBox(height: 14),
              if (node.isGroup)
                FilledButton.tonalIcon(
                  onPressed: favoriteCount == 0 ? null : _openFavoritesView,
                  icon: const Icon(Icons.favorite_border_rounded),
                  label: Text(
                    favoriteCount == 0
                        ? 'Favorite individual study spots from the list'
                        : 'View $favoriteCount saved spot${favoriteCount == 1 ? '' : 's'}',
                  ),
                )
              else
                FilledButton.tonalIcon(
                  onPressed: _savingFavorites
                      ? null
                      : () => _toggleFavorite(node),
                  icon: Icon(
                    isFavorite
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    color: isFavorite
                        ? const Color(0xFFB91C1C)
                        : const Color(0xFFB45309),
                  ),
                  label: Text(
                    isFavorite ? 'Saved to favorites' : 'Save to favorites',
                  ),
                ),
              if (_detailsExpanded) ...[
                const SizedBox(height: 14),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _info(
                      'Name',
                      node.isGroup
                          ? node.buildingName
                          : (node.sublocationLabel ?? node.title),
                    ),
                    if (node.distanceMeters != null)
                      _info('Distance', _distanceLabel(node.distanceMeters!)),
                    _info('Noise', node.noiseText),
                    _info('Occupancy', node.occupancyText),
                    _info('Users present', _usersPresentText(node)),
                    _info('Last updated', node.updatedAtLabel),
                    _info('Usual business', _usualBusinessText(node)),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _info(String label, String value) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF829AB1),
                fontWeight: FontWeight.w800,
                fontSize: 11,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: const TextStyle(
                color: Color(0xFF334E68),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pill(String label) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFE2E8F0),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: Color(0xFF334155),
          ),
        ),
      ),
    );
  }
}

class _FavoriteSheetEntry {
  const _FavoriteSheetEntry({required this.id, required this.node});

  final String id;
  final MapNode? node;
}

String _title(MapNode node) =>
    node.isGroup ? node.buildingName : '${node.buildingName} - ${node.title}';
String _groupId(String building) =>
    'group-${building.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-')}';
String _badgeForFloor(String floorLabel, String title) =>
    RegExp(r'(\d+)').firstMatch(floorLabel)?.group(1) ??
    title.substring(0, 1).toUpperCase();
String _trimMetric(String? value, String fallback) =>
    ((value ?? '').trim().contains(':'))
    ? (value!.split(':').last.trim())
    : (((value ?? '').trim().isEmpty) ? fallback : value!.trim());
Severity _severityFromString(String? value) =>
    switch ((value ?? '').toLowerCase().trim()) {
      'high' => Severity.high,
      'medium' => Severity.medium,
      _ => Severity.low,
    };
String _severityLabel(Severity severity) => switch (severity) {
  Severity.high => 'High activity',
  Severity.medium => 'Moderate activity',
  Severity.low => 'Mostly quiet',
};
String _sortLabel(SearchSort value) => switch (value) {
  SearchSort.relevance => 'Relevance',
  SearchSort.distance => 'Distance',
  SearchSort.noise => 'Noise',
  SearchSort.occupancy => 'Occupancy',
};
String _distanceLabel(double value) => value >= 1000
    ? '${(value / 1000).toStringAsFixed(2)} km'
    : '${value.round()} m';
double _overlayZoomScale(double zoom, bool isGroup) {
  if (isGroup) {
    return ((17.1 - zoom) * 0.22 + 1).clamp(0.8, 1.26);
  }
  return ((zoom - 16.4) * 0.18 + 1).clamp(0.92, 1.28);
}

double _heatSize(MapNode node, double zoom) {
  final baseSize = node.isGroup
      ? switch (node.severity) {
          Severity.high => 190.0,
          Severity.medium => 158.0,
          Severity.low => 132.0,
        }
      : switch (node.severity) {
          Severity.high => 128.0,
          Severity.medium => 108.0,
          Severity.low => 92.0,
        };
  return baseSize * _overlayZoomScale(zoom, node.isGroup);
}

Color _heatColor(MapNode node) => switch (node.severity) {
  Severity.low => const Color(0xFF2563EB),
  Severity.medium => const Color(0xFFFACC15),
  Severity.high => const Color(0xFFDC2626),
};

Color _colorFromHex(String hex) {
  final normalized = hex.replaceFirst('#', '');
  final buffer = StringBuffer(
    normalized.length == 6 ? 'ff$normalized' : normalized,
  );
  return Color(int.parse(buffer.toString(), radix: 16));
}

int _fallbackNoiseBand(Severity severity) => switch (severity) {
  Severity.low => 1,
  Severity.medium => 3,
  Severity.high => 5,
};

/// Marker sizing that mirrors the web's `getSize()` in MapMarkerVisual.tsx.
double _markerSize(double zoom, bool isGroup, bool isSub, bool isSelected) {
  const referenceZoom = 15.0;
  const scalePerZoom = 0.12;
  const minScale = 0.6;
  const shrinkPerZoom = 0.06;
  const selectedBoost = 14.0;

  final base = isGroup ? 48.0 : (isSub ? 36.0 : 48.0);
  double scaleFactor;
  if (zoom >= referenceZoom) {
    scaleFactor = 1 + (zoom - referenceZoom) * scalePerZoom;
  } else {
    scaleFactor = (1 - (referenceZoom - zoom) * shrinkPerZoom).clamp(minScale, 1.0);
  }
  final size = base * scaleFactor;
  return isSelected ? size + selectedBoost : size;
}
