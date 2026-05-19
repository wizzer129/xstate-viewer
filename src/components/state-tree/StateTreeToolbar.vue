<template>
	<v-app-bar flat border="b" height="56">
		<v-app-bar-title class="text-body-1 font-weight-medium">
			State Tree Viewer
		</v-app-bar-title>
		<template #append>
			<v-btn-group variant="outlined" density="compact" class="mr-2">
				<v-btn
					icon="mdi-magnify-minus-outline"
					@click="$emit('zoom-out')"
					:disabled="!hasGraph"
				/>
				<v-btn
					icon="mdi-magnify-plus-outline"
					@click="$emit('zoom-in')"
					:disabled="!hasGraph"
				/>
				<v-btn
					icon="mdi-fit-to-screen-outline"
					@click="$emit('reset-zoom')"
					:disabled="!hasGraph"
				/>
			</v-btn-group>
			<v-btn-group variant="outlined" density="compact" class="mr-3">
				<v-btn
					prepend-icon="mdi-download"
					text="SVG"
					@click="$emit('export-svg')"
					:disabled="!hasGraph"
				/>
				<v-btn
					prepend-icon="mdi-download"
					text="PNG"
					@click="$emit('export-png')"
					:disabled="!hasGraph"
				/>
			</v-btn-group>
		</template>
	</v-app-bar>
</template>

<script setup>
defineProps({
	hasGraph: {
		type: Boolean,
		required: true,
	},
});

defineEmits(['zoom-out', 'zoom-in', 'reset-zoom', 'export-svg', 'export-png']);
</script>
